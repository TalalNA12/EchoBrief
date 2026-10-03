import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import Busboy from "busboy";
import { createWriteStream } from "fs";
import { mkdir, readdir, rm } from "fs/promises";
import { Readable } from "stream";
import { pipeline } from "stream/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";
// Local/self-hosted Node can comfortably run longer jobs.
// Deployment platforms may impose their own smaller hard limits.
export const maxDuration = 1800;

const MAX_UPLOAD_BYTES =
  Number(process.env.ECHOBRIEF_MAX_UPLOAD_BYTES) ||
  8 * 1024 * 1024 * 1024;

const TIMESTAMP_CHUNK_SECONDS = 24 * 60;
const NOTES_CHUNK_SECONDS = 50 * 60;
const SPEECH_SAMPLE_RATE = 16000;
const SPEECH_BITRATE = "64k";

type EchoBriefOutput = {
  mode?: "notes" | "timestamps";
  rawTranscript: string;
  cleanTranscript: string;
  englishTranslation: string;
  summary: string;
  actionItems: string[];
  deadlines: string[];
  importantDetails: string[];
  unclearParts: string[];
  timestampedTranscript?: string;
};

type WordTiming = {
  word: string;
  startOffset: string;
  endOffset: string;
  speaker?: string;
};

type UploadedDiskFile = {
  originalFilename: string;
  mimeType: string;
  inputPath: string;
  sizeBytes: number;
};

type AudioChunk = {
  path: string;
  offsetSeconds: number;
  partNumber: number;
};

const NOTES_PRIMARY_MODEL =
  process.env.GEMINI_NOTES_MODEL || "gemini-3.5-flash-lite";

const NOTES_FALLBACK_MODELS = (
  process.env.GEMINI_NOTES_FALLBACK_MODELS ||
  "gemini-3.6-flash,gemini-3.8-flash"
)
  .split(",")
  .map((model) => model.trim())
  .filter(Boolean);

const NOTES_MODELS = Array.from(
  new Set([NOTES_PRIMARY_MODEL, ...NOTES_FALLBACK_MODELS])
);

const TRANSCRIBE_MODEL =
  process.env.GEMINI_TRANSCRIBE_MODEL || "gemini-3.5-transcribe";

const ai = new GoogleGenAI({
  apiKey: process.env.GEMINI_API_KEY,
});

const ffmpegPath =
  process.platform === "win32"
    ? path.join(process.cwd(), "node_modules", "ffmpeg-static", "ffmpeg.exe")
    : ffmpegStatic;

if (ffmpegPath) {
  ffmpeg.setFfmpegPath(ffmpegPath);
}

export async function POST(request: NextRequest) {
  let workingDir = "";

  try {
    if (!process.env.GEMINI_API_KEY) {
      return NextResponse.json(
        { error: "Missing GEMINI_API_KEY in .env.local" },
        { status: 500 }
      );
    }

    workingDir = path.join(
      os.tmpdir(),
      `echobrief-${crypto.randomUUID()}`
    );

    await mkdir(workingDir, { recursive: true });

    /**
     * IMPORTANT:
     * Do not call request.formData() here.
     *
     * A multi-gigabyte video can cause Next/Node to buffer a huge body in memory.
     * Busboy streams each upload straight to disk instead.
     */
    const {
      files: uploadedFiles,
      mode,
    } = await streamMultipartUploadToDisk(request, workingDir);

    if (uploadedFiles.length === 0) {
      return NextResponse.json(
        { error: "No audio or video files uploaded." },
        { status: 400 }
      );
    }

    console.log(
      `[EchoBrief] Received ${uploadedFiles.length} file(s) in ${mode} mode`
    );

    const perFileOutputs: EchoBriefOutput[] = [];

    for (let index = 0; index < uploadedFiles.length; index++) {
      const file = uploadedFiles[index];

      console.log(
        `[EchoBrief] Preparing ${file.originalFilename} ` +
        `(${formatBytes(file.sizeBytes)})`
      );

      const preparedAudioPath = await prepareMediaForGemini(
        file.inputPath,
        file.originalFilename,
        file.mimeType,
        file.sizeBytes
      );

      /**
       * If FFmpeg created a new MP3, remove the original multi-GB video/audio
       * immediately. From this point on EchoBrief only needs the tiny speech MP3.
       */
      if (preparedAudioPath !== file.inputPath) {
        await rm(file.inputPath, { force: true });

        console.log(
          `[EchoBrief] Removed original media after audio extraction: ` +
          `${file.originalFilename}`
        );
      }

      const chunkSeconds =
        mode === "timestamps"
          ? TIMESTAMP_CHUNK_SECONDS
          : NOTES_CHUNK_SECONDS;

      const chunks = await splitAudioIntoChunks({
        audioPath: preparedAudioPath,
        workingDir,
        fileIndex: index,
        chunkSeconds,
      });

      // Once chunks exist, the source MP3 is no longer needed.
      if (
        chunks.length > 0 &&
        !chunks.some((chunk) => chunk.path === preparedAudioPath)
      ) {
        await rm(preparedAudioPath, { force: true });
      }

      console.log(
        `[EchoBrief] ${file.originalFilename}: ${chunks.length} audio chunk(s)`
      );

      const chunkOutputs: EchoBriefOutput[] = [];

      for (const chunk of chunks) {
        console.log(
          `[EchoBrief] Processing ${file.originalFilename} ` +
          `part ${chunk.partNumber}/${chunks.length}`
        );

        const chunkOutput = await analyzeAudioChunkWithGemini({
          audioPath: chunk.path,
          mimeType: getMimeType(chunk.path),
          originalFilename: file.originalFilename,
          fileNumber: index + 1,
          totalFiles: uploadedFiles.length,
          mode,
          chunkNumber: chunk.partNumber,
          totalChunks: chunks.length,
          chunkOffsetSeconds: chunk.offsetSeconds,
        });

        chunkOutputs.push(chunkOutput);

        // Gemini has the uploaded copy now, so free local disk as we go.
        await rm(chunk.path, { force: true });
      }

      perFileOutputs.push(
        mergeChunksForSingleFile(chunkOutputs, mode)
      );
    }

    const mergedOutput = mergeOutputs(perFileOutputs);

    return NextResponse.json(mergedOutput);
  } catch (error) {
    console.error("EchoBrief API error:", error);

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to process audio files.",
      },
      { status: 500 }
    );
  } finally {
    if (workingDir) {
      await rm(workingDir, { recursive: true, force: true });
    }
  }
}

async function analyzeAudioChunkWithGemini({
  audioPath,
  mimeType,
  originalFilename,
  fileNumber,
  totalFiles,
  mode,
  chunkNumber,
  totalChunks,
  chunkOffsetSeconds,
}: {
  audioPath: string;
  mimeType: string;
  originalFilename: string;
  fileNumber: number;
  totalFiles: number;
  mode: "notes" | "timestamps";
  chunkNumber: number;
  totalChunks: number;
  chunkOffsetSeconds: number;
}): Promise<EchoBriefOutput> {
  const uploadedFile = await ai.files.upload({
    file: audioPath,
    config: {
      mimeType,
      displayName:
        totalChunks > 1
          ? `${originalFilename} - part ${chunkNumber}`
          : originalFilename,
    },
  });

  if (!uploadedFile.uri || !uploadedFile.mimeType) {
    throw new Error("Gemini file upload failed.");
  }

  console.log(
    `[EchoBrief] ${mode} | ${originalFilename} | ` +
    `part ${chunkNumber}/${totalChunks}`
  );

  if (mode === "timestamps") {
    return analyzeTimestampMode({
      fileUri: uploadedFile.uri,
      mimeType: uploadedFile.mimeType,
      originalFilename,
      fileNumber,
      totalFiles,
      chunkNumber,
      totalChunks,
      chunkOffsetSeconds,
    });
  }

  return analyzeNotesMode({
    fileUri: uploadedFile.uri,
    mimeType: uploadedFile.mimeType,
    originalFilename:
      totalChunks > 1
        ? `${originalFilename} (part ${chunkNumber}/${totalChunks})`
        : originalFilename,
    fileNumber,
    totalFiles,
  });
}

/**
 * NOTES MODE
 *
 * Uses a lightweight multimodal Flash model first, then automatically falls
 * back to other stable Flash models if Google returns overload/rate-limit
 * errors. This keeps routine EchoBrief work away from the heaviest model.
 */
async function analyzeNotesMode({
  fileUri,
  mimeType,
  originalFilename,
  fileNumber,
  totalFiles,
}: {
  fileUri: string;
  mimeType: string;
  originalFilename: string;
  fileNumber: number;
  totalFiles: number;
}): Promise<EchoBriefOutput> {
  const prompt = `
You are EchoBrief, an audio-to-readable-notes assistant.

Analyze this audio file.

Context:
- This is file ${fileNumber} of ${totalFiles}.
- Original filename: ${originalFilename}.
- The audio may contain English, Urdu, Hindi, Punjabi, or mixed languages.

Return valid JSON only.

Use exactly this JSON shape:
{
  "mode": "notes",
  "rawTranscript": "",
  "cleanTranscript": "",
  "englishTranslation": "",
  "summary": "",
  "actionItems": [],
  "deadlines": [],
  "importantDetails": [],
  "unclearParts": [],
  "timestampedTranscript": ""
}

Rules:
- rawTranscript should stay close to what was spoken.
- cleanTranscript should be readable, punctuated, and organized into paragraphs.
- englishTranslation should translate the full meaning into clear English.
- If the audio is already English, rewrite it clearly in English.
- summary should be short but complete.
- actionItems should contain clear tasks only.
- deadlines should include any date, day, time, submission deadline, meeting time, or timing mentioned.
- importantDetails should include names, places, requirements, instructions, or constraints.
- unclearParts should mention anything hard to understand or uncertain.
- timestampedTranscript must be empty in notes mode.
- Do not invent details.
- Do not include markdown.
- Do not wrap the JSON in triple backticks.
`;

  try {
    const text = await generateJsonWithFallback({
      contents: createUserContent([
        createPartFromUri(fileUri, mimeType),
        prompt,
      ]),
      label: `Notes analysis for ${originalFilename}`,
    });

    return parseGeminiJson(text);
  } catch (analysisError) {
    console.warn(
      "[EchoBrief] All Notes models were unavailable. Falling back to transcription-only output.",
      analysisError
    );

    const fallbackTranscript = await transcribeWithoutTimestamps({
      fileUri,
      mimeType,
      smart: true,
    });

    return {
      mode: "notes",
      rawTranscript: fallbackTranscript,
      cleanTranscript: fallbackTranscript,
      englishTranslation: "",
      summary:
        "Structured AI analysis is temporarily unavailable. The transcript was still recovered successfully.",
      actionItems: [],
      deadlines: [],
      importantDetails: [],
      unclearParts: [],
      timestampedTranscript: "",
    };
  }
}

/**
 * TIMESTAMP MODE
 *
 * IMPORTANT:
 * Gemini 3.5 Transcribe uses the Interactions API, not generateContent.
 * Word timestamps are returned as word_info annotations on interaction.steps.
 */
async function analyzeTimestampMode({
  fileUri,
  mimeType,
  originalFilename,
  fileNumber,
  totalFiles,
  chunkNumber,
  totalChunks,
  chunkOffsetSeconds,
}: {
  fileUri: string;
  mimeType: string;
  originalFilename: string;
  fileNumber: number;
  totalFiles: number;
  chunkNumber: number;
  totalChunks: number;
  chunkOffsetSeconds: number;
}): Promise<EchoBriefOutput> {
  console.log(
    `[EchoBrief] Transcribing timestamps with ${TRANSCRIBE_MODEL} ` +
    `(part ${chunkNumber}/${totalChunks}, offset ${chunkOffsetSeconds}s)`
  );

  const interaction = await createTranscriptionInteraction({
    fileUri,
    mimeType,
    withWordTimestamps: true,
  });

  const wordTimings = extractWordTranscriptions(interaction);

  let rawTranscript = getInteractionOutputText(interaction).trim();

  if (!rawTranscript && wordTimings.length > 0) {
    rawTranscript = joinWords(wordTimings.map((word) => word.word));
  }

  if (!rawTranscript) {
    throw new Error(
      `${TRANSCRIBE_MODEL} returned an empty transcript.`
    );
  }

  if (wordTimings.length === 0) {
    throw new Error(
      `${TRANSCRIBE_MODEL} returned text but no word timestamps. ` +
      `Update @google/genai and retry with a short audio file.`
    );
  }

  const timestampedTranscript =
    buildTimestampedTranscript(
      wordTimings,
      chunkOffsetSeconds
    );

  try {
    const analysis = await analyzeTranscriptWithFlash({
      rawTranscript,
      timestampedTranscript,
      originalFilename,
      fileNumber,
      totalFiles,
    });

    return {
      mode: "timestamps",
      rawTranscript,
      cleanTranscript: analysis.cleanTranscript,
      englishTranslation: analysis.englishTranslation,
      summary: analysis.summary,
      actionItems: analysis.actionItems,
      deadlines: analysis.deadlines,
      importantDetails: analysis.importantDetails,
      unclearParts: analysis.unclearParts,
      timestampedTranscript,
    };
  } catch (analysisError) {
    // Timestamp Mode should remain useful even if the general-purpose
    // Gemini models are temporarily overloaded.
    console.warn(
      "[EchoBrief] Transcript succeeded, but structured analysis is unavailable.",
      analysisError
    );

    return {
      mode: "timestamps",
      rawTranscript,
      cleanTranscript: rawTranscript,
      englishTranslation: "",
      summary:
        "Timestamped transcription completed. Additional AI analysis is temporarily unavailable.",
      actionItems: [],
      deadlines: [],
      importantDetails: [],
      unclearParts: [],
      timestampedTranscript,
    };
  }
}

async function analyzeTranscriptWithFlash({
  rawTranscript,
  timestampedTranscript,
  originalFilename,
  fileNumber,
  totalFiles,
}: {
  rawTranscript: string;
  timestampedTranscript: string;
  originalFilename: string;
  fileNumber: number;
  totalFiles: number;
}): Promise<EchoBriefOutput> {
  const prompt = `
You are EchoBrief.

A dedicated speech-to-text model has already transcribed this audio and generated
accurate word-level timestamps.

Your job is to analyze the transcript. Do NOT invent or alter timing information.

Context:
- This is file ${fileNumber} of ${totalFiles}.
- Original filename: ${originalFilename}.
- The speech may contain English, Urdu, Hindi, Punjabi, or mixed languages.

RAW TRANSCRIPT:
${rawTranscript}

EDITOR TIMESTAMP TRANSCRIPT:
${timestampedTranscript}

Return valid JSON only.

Use exactly this JSON shape:
{
  "mode": "timestamps",
  "rawTranscript": "",
  "cleanTranscript": "",
  "englishTranslation": "",
  "summary": "",
  "actionItems": [],
  "deadlines": [],
  "importantDetails": [],
  "unclearParts": [],
  "timestampedTranscript": ""
}

Rules:
- rawTranscript must preserve the meaning of the RAW TRANSCRIPT above.
- cleanTranscript should be readable, punctuated, and organized into paragraphs.
- englishTranslation should translate the full meaning into clear English.
- If it is already English, provide a polished English rendering.
- summary should briefly summarize the content.
- actionItems should contain clear tasks only.
- deadlines should contain actual dates, times, days, or timing requirements mentioned.
- importantDetails should include names, places, requirements, instructions, or constraints.
- unclearParts should mention anything uncertain in the transcript.
- timestampedTranscript should be an empty string. EchoBrief already generated authoritative timestamps separately.
- Do not invent details.
- Do not include markdown.
- Do not wrap the JSON in triple backticks.
`;

  const text = await generateJsonWithFallback({
    contents: prompt,
    label: `Transcript analysis for ${originalFilename}`,
  });

  return parseGeminiJson(text);
}

async function createTranscriptionInteraction({
  fileUri,
  mimeType,
  withWordTimestamps,
  smart = false,
}: {
  fileUri: string;
  mimeType: string;
  withWordTimestamps: boolean;
  smart?: boolean;
}): Promise<any> {
  const transcriptionMode = smart
    ? "smart"
    : withWordTimestamps
      ? {
        type: "verbatim",
        timestamp_granularities: ["word"],
      }
      : "verbatim";

  return await (ai as any).interactions.create({
    model: TRANSCRIBE_MODEL,
    input: [
      {
        type: "audio",
        uri: fileUri,
        mime_type: mimeType,
      },
    ],
    generation_config: {
      transcription_config: {
        language_codes: [],
        mode: transcriptionMode,
      },
    },
  });
}

async function transcribeWithoutTimestamps({
  fileUri,
  mimeType,
  smart = false,
}: {
  fileUri: string;
  mimeType: string;
  smart?: boolean;
}): Promise<string> {
  const interaction = await createTranscriptionInteraction({
    fileUri,
    mimeType,
    withWordTimestamps: false,
    smart,
  });

  const text = getInteractionOutputText(interaction).trim();

  if (!text) {
    throw new Error(
      `${TRANSCRIBE_MODEL} returned an empty transcript during fallback transcription.`
    );
  }

  return text;
}

function getInteractionOutputText(interaction: any): string {
  return String(
    interaction?.output_text ??
    interaction?.outputText ??
    ""
  );
}

function extractWordTranscriptions(interaction: unknown): WordTiming[] {
  const words: WordTiming[] = [];
  const typedInteraction = interaction as any;

  for (const step of typedInteraction?.steps ?? []) {
    for (const content of step?.content ?? []) {
      for (const annotation of content?.annotations ?? []) {
        if (annotation?.type !== "word_info") continue;

        const word = String(
          annotation?.text ??
          annotation?.word ??
          ""
        ).trim();

        const startOffset = String(
          annotation?.start_offset ??
          annotation?.startOffset ??
          ""
        );

        const endOffset = String(
          annotation?.end_offset ??
          annotation?.endOffset ??
          ""
        );

        const speaker = String(
          annotation?.speaker ?? ""
        );

        if (!word || !startOffset || !endOffset) continue;

        words.push({
          word,
          startOffset,
          endOffset,
          speaker,
        });
      }
    }
  }

  return words;
}

async function generateJsonWithFallback({
  contents,
  label,
}: {
  contents: any;
  label: string;
}): Promise<string> {
  let lastError: unknown;

  for (const model of NOTES_MODELS) {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        console.log(
          `[EchoBrief] ${label} | model=${model} | attempt=${attempt}`
        );

        const response = await ai.models.generateContent({
          model,
          contents,
          config: {
            responseMimeType: "application/json",
          },
        });

        const text = response.text || "";

        if (!text.trim()) {
          throw new Error(`${model} returned an empty response.`);
        }

        return text;
      } catch (error) {
        lastError = error;

        const status = getApiStatus(error);
        const retryable =
          status === 429 ||
          status === 500 ||
          status === 503 ||
          status === 404 ||
          /overloaded|resource_exhausted|too many requests|unavailable/i.test(
            error instanceof Error ? error.message : String(error)
          );

        console.warn(
          `[EchoBrief] ${model} failed (attempt ${attempt})`,
          error
        );

        if (!retryable) {
          throw error;
        }

        if (attempt < 2) {
          await sleep(700 * attempt);
        }
      }
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("All Gemini notes models are temporarily unavailable.");
}

function getApiStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;

  const maybeError = error as {
    status?: number;
    code?: number;
    error?: { code?: number };
  };

  return (
    maybeError.status ??
    maybeError.code ??
    maybeError.error?.code
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildTimestampedTranscript(
  words: WordTiming[],
  baseOffsetSeconds = 0
): string {
  if (words.length === 0) return "";

  const lines: string[] = [];
  let currentWords: WordTiming[] = [];

  const flush = () => {
    if (currentWords.length === 0) return;

    const first = currentWords[0];
    const last = currentWords[currentWords.length - 1];

    const start =
      baseOffsetSeconds + parseOffsetSeconds(first.startOffset);
    const end =
      baseOffsetSeconds + parseOffsetSeconds(last.endOffset);
    const sentence = joinWords(
      currentWords.map((word) => word.word)
    );

    lines.push(
      `[${formatTimestamp(start, false)}] - ` +
      `[${formatTimestamp(end, true)}] ${sentence}`
    );

    currentWords = [];
  };

  for (let index = 0; index < words.length; index++) {
    const current = words[index];
    currentWords.push(current);

    const next = words[index + 1];

    const endsSentence = /[.!?]["')\]]?$/.test(current.word);
    const phraseTooLong = currentWords.length >= 18;

    let hasNaturalPause = false;

    if (next) {
      const currentEnd = parseOffsetSeconds(current.endOffset);
      const nextStart = parseOffsetSeconds(next.startOffset);

      hasNaturalPause = nextStart - currentEnd >= 0.9;
    }

    if (
      endsSentence ||
      hasNaturalPause ||
      phraseTooLong ||
      !next
    ) {
      flush();
    }
  }

  return lines.join("\n");
}

function joinWords(words: string[]): string {
  return words
    .join(" ")
    .replace(/\s+([,.;!?%:])/g, "$1")
    .replace(/([(\[{])\s+/g, "$1")
    .replace(/\s+([)\]}])/g, "$1")
    .replace(/\s+'/g, "'")
    .replace(/"\s+/g, '"')
    .replace(/\s{2,}/g, " ")
    .trim();
}

function parseOffsetSeconds(offset: string): number {
  const value = Number.parseFloat(offset.replace(/s$/i, ""));
  return Number.isFinite(value) ? value : 0;
}

function formatTimestamp(
  seconds: number,
  roundEndUp: boolean
): string {
  const safeSeconds = Math.max(
    0,
    roundEndUp ? Math.ceil(seconds) : Math.floor(seconds)
  );

  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const secs = safeSeconds % 60;

  if (hours > 0) {
    return `${hours.toString().padStart(2, "0")}:` +
      `${minutes.toString().padStart(2, "0")}:` +
      `${secs.toString().padStart(2, "0")}`;
  }

  return (
    `${minutes.toString().padStart(2, "0")}:` +
    `${secs.toString().padStart(2, "0")}`
  );
}

function parseGeminiJson(text: string): EchoBriefOutput {
  const cleaned = text
    .trim()
    .replace(/^```json/i, "")
    .replace(/^```/i, "")
    .replace(/```$/i, "")
    .trim();

  let parsed: Partial<EchoBriefOutput>;

  try {
    parsed = JSON.parse(cleaned);
  } catch {
    throw new Error(
      `Gemini did not return valid JSON. Response was: ${text}`
    );
  }

  return {
    mode:
      parsed.mode === "timestamps"
        ? "timestamps"
        : "notes",
    rawTranscript: String(parsed.rawTranscript || ""),
    cleanTranscript: String(parsed.cleanTranscript || ""),
    englishTranslation: String(
      parsed.englishTranslation || ""
    ),
    summary: String(parsed.summary || ""),
    actionItems: normalizeStringArray(parsed.actionItems),
    deadlines: normalizeStringArray(parsed.deadlines),
    importantDetails: normalizeStringArray(
      parsed.importantDetails
    ),
    unclearParts: normalizeStringArray(parsed.unclearParts),
    timestampedTranscript: String(
      parsed.timestampedTranscript || ""
    ),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

function mergeOutputs(
  outputs: EchoBriefOutput[]
): EchoBriefOutput {
  const mode = outputs.some(
    (output) => output.mode === "timestamps"
  )
    ? "timestamps"
    : "notes";

  return {
    mode,

    rawTranscript: outputs
      .map(
        (output, index) =>
          `File ${index + 1}\n${output.rawTranscript}`
      )
      .join("\n\n"),

    cleanTranscript: outputs
      .map(
        (output, index) =>
          `File ${index + 1}\n${output.cleanTranscript}`
      )
      .join("\n\n"),

    englishTranslation: outputs
      .map(
        (output, index) =>
          `File ${index + 1}\n${output.englishTranslation}`
      )
      .join("\n\n"),

    summary: outputs
      .map(
        (output, index) =>
          `File ${index + 1}: ${output.summary}`
      )
      .join("\n\n"),

    actionItems: outputs.flatMap((output, index) =>
      output.actionItems.map(
        (item) => `File ${index + 1}: ${item}`
      )
    ),

    deadlines: outputs.flatMap((output, index) =>
      output.deadlines.map(
        (item) => `File ${index + 1}: ${item}`
      )
    ),

    importantDetails: outputs.flatMap((output, index) =>
      output.importantDetails.map(
        (item) => `File ${index + 1}: ${item}`
      )
    ),

    unclearParts: outputs.flatMap((output, index) =>
      output.unclearParts.map(
        (item) => `File ${index + 1}: ${item}`
      )
    ),

    timestampedTranscript: outputs
      .map((output, index) =>
        output.timestampedTranscript
          ? `File ${index + 1}\n${output.timestampedTranscript}`
          : ""
      )
      .filter(Boolean)
      .join("\n\n"),
  };
}

async function streamMultipartUploadToDisk(
  request: NextRequest,
  workingDir: string
): Promise<{
  files: UploadedDiskFile[];
  mode: "notes" | "timestamps";
}> {
  const contentType = request.headers.get("content-type");

  if (!contentType?.toLowerCase().includes("multipart/form-data")) {
    throw new Error(
      "EchoBrief expected a multipart/form-data upload."
    );
  }

  if (!request.body) {
    throw new Error("Upload request had no body.");
  }

  return await new Promise((resolve, reject) => {
    const files: UploadedDiskFile[] = [];
    const writeJobs: Promise<void>[] = [];
    let mode: "notes" | "timestamps" = "notes";
    let settled = false;

    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;

      reject(
        error instanceof Error
          ? error
          : new Error(String(error))
      );
    };

    const parser = Busboy({
      headers: Object.fromEntries(request.headers.entries()),
      limits: {
        files: 20,
        fileSize: MAX_UPLOAD_BYTES,
      },
    });

    parser.on("field", (fieldName, value) => {
      if (fieldName === "mode") {
        mode =
          value === "timestamps"
            ? "timestamps"
            : "notes";
      }
    });

    parser.on("file", (fieldName, fileStream, info) => {
      if (fieldName !== "files") {
        fileStream.resume();
        return;
      }

      const fileIndex = files.length;
      const originalFilename =
        info.filename || `upload-${fileIndex}`;

      const safeOriginalName =
        sanitizeFilename(originalFilename);

      const inputPath = path.join(
        workingDir,
        `${String(fileIndex).padStart(3, "0")}-${safeOriginalName}`
      );

      const diskFile: UploadedDiskFile = {
        originalFilename,
        mimeType: info.mimeType || "application/octet-stream",
        inputPath,
        sizeBytes: 0,
      };

      // Push synchronously so multipart file order is preserved.
      files.push(diskFile);

      let hitSizeLimit = false;

      fileStream.on("data", (chunk: Buffer) => {
        diskFile.sizeBytes += chunk.length;
      });

      fileStream.on("limit", () => {
        hitSizeLimit = true;
      });

      const writeJob = pipeline(
        fileStream,
        createWriteStream(inputPath, {
          flags: "wx",
        })
      ).then(() => {
        if (hitSizeLimit) {
          throw new Error(
            `${originalFilename} exceeded EchoBrief's upload limit of ` +
            `${formatBytes(MAX_UPLOAD_BYTES)}.`
          );
        }
      });

      writeJobs.push(writeJob);
      writeJob.catch(fail);
    });

    parser.on("filesLimit", () => {
      fail(
        new Error(
          "Too many files. EchoBrief accepts up to 20 files per request."
        )
      );
    });

    parser.on("error", fail);

    parser.on("finish", async () => {
      if (settled) return;

      try {
        await Promise.all(writeJobs);

        settled = true;
        resolve({
          files,
          mode,
        });
      } catch (error) {
        fail(error);
      }
    });

    const nodeBody = Readable.fromWeb(
      request.body as any
    );

    nodeBody.on("error", fail);
    parser.on("close", () => {
      // no-op: finish is the success signal
    });

    request.signal.addEventListener(
      "abort",
      () => {
        fail(
          new Error(
            "Upload was aborted before EchoBrief finished receiving the file."
          )
        );
      },
      { once: true }
    );

    nodeBody.pipe(parser);
  });
}

async function prepareMediaForGemini(
  inputPath: string,
  originalFilename: string,
  originalMimeType: string,
  sizeBytes: number
): Promise<string> {
  const extension = path
    .extname(originalFilename)
    .toLowerCase();

  const needsVideoExtraction =
    originalMimeType.startsWith("video/") ||
    [
      ".mp4",
      ".mov",
      ".mkv",
      ".m4v",
      ".avi",
      ".webm",
      ".mpeg",
      ".mpg",
      ".wmv",
    ].includes(extension);

  const isMp3 =
    extension === ".mp3" ||
    originalMimeType === "audio/mpeg";

  // Very large MP3s are normalized too so chunk uploads stay small.
  const shouldNormalizeMp3 =
    isMp3 && sizeBytes > 100 * 1024 * 1024;

  const needsAudioConversion =
    !needsVideoExtraction &&
    (!isMp3 || shouldNormalizeMp3);

  if (needsVideoExtraction) {
    const outputPath = replaceExtension(
      inputPath,
      ".speech.mp3"
    );

    console.log(
      `[EchoBrief] Extracting speech MP3 from ${originalFilename}`
    );

    await extractSpeechMp3(
      inputPath,
      outputPath
    );

    return outputPath;
  }

  if (needsAudioConversion) {
    const outputPath = replaceExtension(
      inputPath,
      ".speech.mp3"
    );

    console.log(
      `[EchoBrief] Normalizing ${originalFilename} to speech MP3`
    );

    await convertAudioToSpeechMp3(
      inputPath,
      outputPath
    );

    return outputPath;
  }

  return inputPath;
}

async function splitAudioIntoChunks({
  audioPath,
  workingDir,
  fileIndex,
  chunkSeconds,
}: {
  audioPath: string;
  workingDir: string;
  fileIndex: number;
  chunkSeconds: number;
}): Promise<AudioChunk[]> {
  const chunkDir = path.join(
    workingDir,
    `chunks-${String(fileIndex).padStart(3, "0")}`
  );

  await mkdir(chunkDir, { recursive: true });

  const outputPattern = path.join(
    chunkDir,
    "part-%03d.mp3"
  );

  /**
   * Segment the already-compressed MP3 without another lossy encode.
   * Timestamps reset inside each file; EchoBrief adds the absolute
   * chunk offset back when formatting the final transcript.
   */
  await new Promise<void>((resolve, reject) => {
    ffmpeg(audioPath)
      .outputOptions([
        "-map 0:a:0",
        "-c:a copy",
        "-f segment",
        `-segment_time ${chunkSeconds}`,
        "-reset_timestamps 1",
      ])
      .on("start", (command) => {
        console.log(
          `[EchoBrief] Splitting audio: ${command}`
        );
      })
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPattern);
  });

  const names = (await readdir(chunkDir))
    .filter((name) => /^part-\d+\.mp3$/i.test(name))
    .sort();

  if (names.length === 0) {
    throw new Error(
      "FFmpeg did not produce any audio chunks."
    );
  }

  return names.map((name, index) => ({
    path: path.join(chunkDir, name),
    offsetSeconds: index * chunkSeconds,
    partNumber: index + 1,
  }));
}

function mergeChunksForSingleFile(
  outputs: EchoBriefOutput[],
  mode: "notes" | "timestamps"
): EchoBriefOutput {
  if (outputs.length === 0) {
    throw new Error(
      "EchoBrief produced no output for this file."
    );
  }

  if (outputs.length === 1) {
    return {
      ...outputs[0],
      mode,
    };
  }

  return {
    mode,

    rawTranscript: outputs
      .map((output) => output.rawTranscript)
      .filter(Boolean)
      .join("\n\n"),

    cleanTranscript: outputs
      .map((output) => output.cleanTranscript)
      .filter(Boolean)
      .join("\n\n"),

    englishTranslation: outputs
      .map((output) => output.englishTranslation)
      .filter(Boolean)
      .join("\n\n"),

    summary: outputs
      .map(
        (output, index) =>
          `Part ${index + 1}: ${output.summary}`
      )
      .filter((value) => !value.endsWith(": "))
      .join("\n\n"),

    actionItems: outputs.flatMap(
      (output) => output.actionItems
    ),

    deadlines: outputs.flatMap(
      (output) => output.deadlines
    ),

    importantDetails: outputs.flatMap(
      (output) => output.importantDetails
    ),

    unclearParts: outputs.flatMap(
      (output) => output.unclearParts
    ),

    timestampedTranscript: outputs
      .map((output) => output.timestampedTranscript || "")
      .filter(Boolean)
      .join("\n"),
  };
}

function replaceExtension(
  filePath: string,
  newExtension: string
): string {
  const extension = path.extname(filePath);

  if (!extension) {
    return `${filePath}${newExtension}`;
  }

  return filePath.slice(
    0,
    -extension.length
  ) + newExtension;
}

function extractSpeechMp3(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioChannels(1)
      .audioFrequency(SPEECH_SAMPLE_RATE)
      .audioBitrate(SPEECH_BITRATE)
      .outputOptions([
        "-map 0:a:0",
        "-vn",
      ])
      .format("mp3")
      .on("start", (command) => {
        console.log(
          `[EchoBrief] FFmpeg extract: ${command}`
        );
      })
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}

function convertAudioToSpeechMp3(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .audioChannels(1)
      .audioFrequency(SPEECH_SAMPLE_RATE)
      .audioBitrate(SPEECH_BITRATE)
      .format("mp3")
      .on("start", (command) => {
        console.log(
          `[EchoBrief] FFmpeg normalize: ${command}`
        );
      })
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}

function getMimeType(filePath: string): string {
  const extension = path
    .extname(filePath)
    .toLowerCase();

  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".aac":
      return "audio/aac";
    case ".flac":
      return "audio/flac";
    case ".webm":
      return "audio/webm";
    case ".ogg":
      return "audio/ogg";
    case ".opus":
      return "audio/opus";
    default:
      return "audio/mpeg";
  }
}

function sanitizeFilename(filename: string): string {
  const sanitized = filename.replace(
    /[^a-zA-Z0-9.\-_]/g,
    "_"
  );

  return sanitized || "upload";
}

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "0 B";
  }

  const units = [
    "B",
    "KB",
    "MB",
    "GB",
    "TB",
  ];

  const unitIndex = Math.min(
    Math.floor(Math.log(bytes) / Math.log(1024)),
    units.length - 1
  );

  const value =
    bytes / Math.pow(1024, unitIndex);

  return `${value.toFixed(
    unitIndex === 0 ? 0 : 2
  )} ${units[unitIndex]}`;
}
