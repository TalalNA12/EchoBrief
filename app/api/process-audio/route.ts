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
  rawTranscript: string;
  cleanTranscript: string;
  englishTranslation: string;
  summary: string;
  actionItems: string[];
  deadlines: string[];
  importantDetails: string[];
  unclearParts: string[];
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

      const preparedAudioPath = await prepareAudioForGemini(inputPath, file.name);
      const mimeType = getMimeType(preparedAudioPath);

      const geminiOutput = await analyzeAudioWithGemini({
        audioPath: preparedAudioPath,
        mimeType,
        originalFilename: file.name,
        fileNumber: index + 1,
        totalFiles: audioFiles.length,
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
}: {
  audioPath: string;
  mimeType: string;
  originalFilename: string;
  fileNumber: number;
  totalFiles: number;
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
  "rawTranscript": "",
  "cleanTranscript": "",
  "englishTranslation": "",
  "summary": "",
  "actionItems": [],
  "deadlines": [],
  "importantDetails": [],
  "unclearParts": []
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
    rawTranscript: String(parsed.rawTranscript || ""),
    cleanTranscript: String(parsed.cleanTranscript || ""),
    englishTranslation: String(parsed.englishTranslation || ""),
    summary: String(parsed.summary || ""),
    actionItems: normalizeStringArray(parsed.actionItems),
    deadlines: normalizeStringArray(parsed.deadlines),
    importantDetails: normalizeStringArray(parsed.importantDetails),
    unclearParts: normalizeStringArray(parsed.unclearParts),
  };
}

function normalizeStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((item) => String(item || "").trim())
    .filter((item) => item.length > 0);
}

function mergeOutputs(outputs: EchoBriefOutput[]): EchoBriefOutput {
  return {
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
  };
}

async function prepareAudioForGemini(
  inputPath: string,
  originalFilename: string
): Promise<string> {
  const extension = path.extname(originalFilename).toLowerCase();

  const needsConversion = [".ogg", ".opus"].includes(extension);

  if (!needsConversion) {
    return inputPath;
  }

  const outputPath = inputPath.replace(extension, ".mp3");

  await convertAudioToMp3(inputPath, outputPath);

  return outputPath;
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