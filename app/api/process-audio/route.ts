import { NextRequest, NextResponse } from "next/server";
import {
  GoogleGenAI,
  createPartFromUri,
  createUserContent,
} from "@google/genai";
import ffmpeg from "fluent-ffmpeg";
import ffmpegStatic from "ffmpeg-static";
import { mkdir, rm, writeFile } from "fs/promises";
import path from "path";
import os from "os";

export const runtime = "nodejs";
export const maxDuration = 300;

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

    const formData = await request.formData();
    const uploadedFiles = formData.getAll("files");
    const modeValue = formData.get("mode");
    const mode: "notes" | "timestamps" =
      modeValue === "timestamps" ? "timestamps" : "notes";

    const audioFiles = uploadedFiles.filter(
      (file): file is File => file instanceof File
    );

    if (audioFiles.length === 0) {
      return NextResponse.json(
        { error: "No audio files uploaded." },
        { status: 400 }
      );
    }

    workingDir = path.join(os.tmpdir(), `echobrief-${crypto.randomUUID()}`);
    await mkdir(workingDir, { recursive: true });

    const perFileOutputs: EchoBriefOutput[] = [];

    for (let index = 0; index < audioFiles.length; index++) {
      const file = audioFiles[index];

      const safeOriginalName = sanitizeFilename(file.name);
      const inputPath = path.join(workingDir, `${index}-${safeOriginalName}`);

      const arrayBuffer = await file.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      await writeFile(inputPath, buffer);

      const preparedAudioPath = await prepareMediaForGemini(inputPath, file.name);
      const mimeType = getMimeType(preparedAudioPath);

      const geminiOutput = await analyzeAudioWithGemini({
        audioPath: preparedAudioPath,
        mimeType,
        originalFilename: file.name,
        fileNumber: index + 1,
        totalFiles: audioFiles.length,
        mode,
      });

      perFileOutputs.push(geminiOutput);
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

async function analyzeAudioWithGemini({
  audioPath,
  mimeType,
  originalFilename,
  fileNumber,
  totalFiles,
  mode,
}: {
  audioPath: string;
  mimeType: string;
  originalFilename: string;
  fileNumber: number;
  totalFiles: number;
  mode: "notes" | "timestamps";
}): Promise<EchoBriefOutput> {
  const uploadedFile = await ai.files.upload({
    file: audioPath,
    config: {
      mimeType,
      displayName: originalFilename,
    },
  });

  if (!uploadedFile.uri || !uploadedFile.mimeType) {
    throw new Error("Gemini file upload failed.");
  }

  const prompt =
    mode === "timestamps"
      ? `
You are EchoBrief, a timestamped transcription assistant for YouTube video editing.

Analyze this audio file.

Context:
- This is file ${fileNumber} of ${totalFiles}.
- Original filename: ${originalFilename}.
- The audio may contain English, Urdu, Hindi, Punjabi, or mixed languages.

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

Timestamp rules:
- timestampedTranscript must be sentence-by-sentence.
- Use this exact format:
[00:00] - [00:05] Sentence here.
[00:05] - [00:11] Next sentence here.
- Use MM:SS format.
- Each line should be one complete sentence or one natural spoken phrase.
- Keep timestamps as accurate as possible.
- If exact timing is uncertain, estimate based on the audio.
- Do not group the entire transcript under one timestamp.
- This output is for video editing, so line breaks must be clean and useful.

Content rules:
- rawTranscript should stay close to what was spoken.
- cleanTranscript should be readable, punctuated, and organized into paragraphs.
- englishTranslation should translate the full meaning into clear English. If already English, rewrite it clearly in English.
- summary should briefly summarize the video/audio content.
- actionItems should contain clear tasks only.
- deadlines should include any date, day, time, deadline, meeting time, or timing mentioned.
- importantDetails should include names, places, requirements, instructions, or constraints.
- unclearParts should mention anything hard to understand or uncertain.
- Do not invent details.
- Do not include markdown.
- Do not wrap the JSON in triple backticks.
`
      : `
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
- englishTranslation should translate the full meaning into clear English. If the audio is already English, rewrite it clearly in English.
- summary should be short but complete.
- actionItems should contain clear tasks only.
- deadlines should include any date, day, time, submission deadline, meeting time, or timing mentioned.
- importantDetails should include names, places, requirements, instructions, or constraints.
- unclearParts should mention anything hard to understand or uncertain.
- timestampedTranscript should be empty in notes mode.
- Do not invent details.
- Do not include markdown.
- Do not wrap the JSON in triple backticks.
`;

  const response = await ai.models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-3.5-flash",
    contents: createUserContent([
      createPartFromUri(uploadedFile.uri, uploadedFile.mimeType),
      prompt,
    ]),
  });

  const text = response.text;

  if (!text) {
    throw new Error("Gemini returned an empty response.");
  }

  return parseGeminiJson(text);
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
    throw new Error(`Gemini did not return valid JSON. Response was: ${text}`);
  }

  return {
    mode: parsed.mode === "timestamps" ? "timestamps" : "notes",
    rawTranscript: String(parsed.rawTranscript || ""),
    cleanTranscript: String(parsed.cleanTranscript || ""),
    englishTranslation: String(parsed.englishTranslation || ""),
    summary: String(parsed.summary || ""),
    actionItems: normalizeStringArray(parsed.actionItems),
    deadlines: normalizeStringArray(parsed.deadlines),
    importantDetails: normalizeStringArray(parsed.importantDetails),
    unclearParts: normalizeStringArray(parsed.unclearParts),
    timestampedTranscript: String(parsed.timestampedTranscript || ""),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

function mergeOutputs(outputs: EchoBriefOutput[]): EchoBriefOutput {
  const mode = outputs.some((output) => output.mode === "timestamps")
    ? "timestamps"
    : "notes";

  return {
    mode,
    rawTranscript: outputs
      .map((output, index) => `File ${index + 1}\n${output.rawTranscript}`)
      .join("\n\n"),
    cleanTranscript: outputs
      .map((output, index) => `File ${index + 1}\n${output.cleanTranscript}`)
      .join("\n\n"),
    englishTranslation: outputs
      .map((output, index) => `File ${index + 1}\n${output.englishTranslation}`)
      .join("\n\n"),
    summary: outputs
      .map((output, index) => `File ${index + 1}: ${output.summary}`)
      .join("\n\n"),
    actionItems: outputs.flatMap((output, index) =>
      output.actionItems.map((item) => `File ${index + 1}: ${item}`)
    ),
    deadlines: outputs.flatMap((output, index) =>
      output.deadlines.map((item) => `File ${index + 1}: ${item}`)
    ),
    importantDetails: outputs.flatMap((output, index) =>
      output.importantDetails.map((item) => `File ${index + 1}: ${item}`)
    ),
    unclearParts: outputs.flatMap((output, index) =>
      output.unclearParts.map((item) => `File ${index + 1}: ${item}`)
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

async function prepareMediaForGemini(
  inputPath: string,
  originalFilename: string
): Promise<string> {
  const extension = path.extname(originalFilename).toLowerCase();

  const needsAudioConversion = [".ogg", ".opus"].includes(extension);
  const needsVideoExtraction = [".mp4", ".mov", ".mkv"].includes(extension);

  if (needsVideoExtraction) {
    const outputPath = inputPath.replace(extension, ".mp3");
    await extractMp3FromVideo(inputPath, outputPath);
    return outputPath;
  }

  if (needsAudioConversion) {
    const outputPath = inputPath.replace(extension, ".mp3");
    await convertAudioToMp3(inputPath, outputPath);
    return outputPath;
  }

  return inputPath;
}

function extractMp3FromVideo(
  inputPath: string,
  outputPath: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .noVideo()
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (error) => reject(error))
      .save(outputPath);
  });
}

function convertAudioToMp3(inputPath: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    ffmpeg(inputPath)
      .audioCodec("libmp3lame")
      .audioBitrate("128k")
      .format("mp3")
      .on("end", () => resolve())
      .on("error", (error: any) => reject(error))
      .save(outputPath);
  });
}

function getMimeType(filePath: string): string {
  const extension = path.extname(filePath).toLowerCase();

  switch (extension) {
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".mp4":
      return "audio/mp4";
    case ".webm":
      return "audio/webm";
    default:
      return "audio/mpeg";
  }
}

function sanitizeFilename(filename: string): string {
  return filename.replace(/[^a-zA-Z0-9.\-_]/g, "_");
}