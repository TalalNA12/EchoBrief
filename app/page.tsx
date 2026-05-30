"use client";

import { useState } from "react";

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

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [output, setOutput] = useState<EchoBriefOutput | null>(null);
  const [error, setError] = useState("");

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);
    setFiles(selectedFiles);
    setOutput(null);
    setError("");
  }

  function moveFileUp(index: number) {
    if (index === 0) return;

    setFiles((currentFiles) => {
      const updatedFiles = [...currentFiles];
      [updatedFiles[index - 1], updatedFiles[index]] = [
        updatedFiles[index],
        updatedFiles[index - 1],
      ];
      return updatedFiles;
    });
  }

  function moveFileDown(index: number) {
    if (index === files.length - 1) return;

    setFiles((currentFiles) => {
      const updatedFiles = [...currentFiles];
      [updatedFiles[index + 1], updatedFiles[index]] = [
        updatedFiles[index],
        updatedFiles[index + 1],
      ];
      return updatedFiles;
    });
  }

  function removeFile(index: number) {
    setFiles((currentFiles) =>
      currentFiles.filter((_, fileIndex) => fileIndex !== index)
    );
  }

  async function handleProcessAudio() {
    if (files.length === 0) {
      setError("Please upload at least one audio file.");
      return;
    }

    setIsProcessing(true);
    setError("");
    setOutput(null);

    try {
      const formData = new FormData();

      files.forEach((file) => {
        formData.append("files", file);
      });

      const response = await fetch("/api/process-audio", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong.");
      }

      setOutput(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function copyText(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  const aiReadyText = output
    ? `EchoBrief Output

Summary:
${output.summary}

Clean Transcript:
${output.cleanTranscript}

English Translation:
${output.englishTranslation}

Action Items:
${output.actionItems.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Deadlines:
${output.deadlines.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Important Details:
${output.importantDetails.map((item, index) => `${index + 1}. ${item}`).join("\n")}

Unclear Parts:
${output.unclearParts.map((item, index) => `${index + 1}. ${item}`).join("\n")}
`
    : "";

  return (
    <main className="min-h-screen bg-zinc-950 text-white">
      <section className="mx-auto flex min-h-screen max-w-6xl flex-col px-6 py-12">
        <div className="mb-10">
          <p className="mb-3 text-sm uppercase tracking-[0.35em] text-cyan-300">
            EchoBrief
          </p>

          <h1 className="max-w-4xl text-4xl font-semibold tracking-tight sm:text-6xl">
            Turn messy voice notes into clean, AI-ready text.
          </h1>

          <p className="mt-5 max-w-2xl text-base leading-7 text-zinc-400">
            Upload multiple audio files, arrange them in the correct order, and
            turn them into transcripts, English translations, summaries, and
            action items.
          </p>
        </div>

        <div className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6 shadow-2xl">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-700 bg-zinc-950/60 px-6 py-12 text-center transition hover:border-cyan-400">
            <span className="text-lg font-medium">Upload voice notes</span>

            <span className="mt-2 text-sm text-zinc-400">
              Supports mp3, wav, m4a, webm, ogg, and opus
            </span>

            <input
              type="file"
              accept="audio/*,.ogg,.opus"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />
          </label>

          {files.length > 0 && (
            <div className="mt-6">
              <div className="mb-3 flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
                <h2 className="text-sm font-medium text-zinc-300">
                  Selected files
                </h2>

                <p className="text-xs text-zinc-500">
                  Arrange these in the exact listening order before processing.
                </p>
              </div>

              <div className="space-y-2">
                {files.map((file, index) => (
                  <div
                    key={`${file.name}-${file.lastModified}-${index}`}
                    className="flex flex-col gap-3 rounded-xl bg-zinc-950 px-4 py-3 text-sm text-zinc-300 sm:flex-row sm:items-center sm:justify-between"
                  >
                    <div className="min-w-0">
                      <p className="truncate font-medium">
                        {index + 1}. {file.name}
                      </p>

                      <p className="mt-1 text-xs text-zinc-500">
                        {(file.size / 1024 / 1024).toFixed(2)} MB
                      </p>
                    </div>

                    <div className="flex shrink-0 flex-wrap gap-2">
                      <button
                        type="button"
                        onClick={() => moveFileUp(index)}
                        disabled={index === 0 || isProcessing}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Up
                      </button>

                      <button
                        type="button"
                        onClick={() => moveFileDown(index)}
                        disabled={index === files.length - 1 || isProcessing}
                        className="rounded-lg border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:border-cyan-400 hover:text-cyan-300 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Down
                      </button>

                      <button
                        type="button"
                        onClick={() => removeFile(index)}
                        disabled={isProcessing}
                        className="rounded-lg border border-red-900 px-3 py-2 text-xs text-red-300 hover:border-red-500 hover:text-red-200 disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {error && (
            <p className="mt-4 rounded-xl border border-red-900 bg-red-950/50 px-4 py-3 text-sm text-red-200">
              {error}
            </p>
          )}

          <button
            onClick={handleProcessAudio}
            disabled={isProcessing}
            className="mt-6 w-full rounded-2xl bg-cyan-400 px-6 py-4 font-semibold text-zinc-950 transition hover:bg-cyan-300 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {isProcessing ? "Processing audio..." : "Process Audio"}
          </button>
        </div>

        {output && (
          <div className="mt-8 grid gap-5">
            <div className="flex flex-col gap-3 rounded-3xl border border-cyan-900 bg-cyan-950/20 p-5 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <h2 className="text-lg font-semibold">AI-ready output</h2>
                <p className="mt-1 text-sm text-zinc-400">
                  Copy this when you want to paste the final result into another
                  AI model.
                </p>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => copyText(aiReadyText)}
                  className="rounded-xl bg-cyan-400 px-4 py-2 text-sm font-semibold text-zinc-950 hover:bg-cyan-300"
                >
                  Copy All
                </button>

                <button
                  onClick={() =>
                    downloadTextFile("echobrief-output.txt", aiReadyText)
                  }
                  className="rounded-xl border border-zinc-700 px-4 py-2 text-sm text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
                >
                  Download TXT
                </button>
              </div>
            </div>

            <OutputCard
              title="Summary"
              content={output.summary}
              onCopy={() => copyText(output.summary)}
            />

            <OutputCard
              title="Clean Transcript"
              content={output.cleanTranscript}
              onCopy={() => copyText(output.cleanTranscript)}
            />

            <OutputCard
              title="English Translation"
              content={output.englishTranslation}
              onCopy={() => copyText(output.englishTranslation)}
            />

            <ListCard title="Action Items" items={output.actionItems} />
            <ListCard title="Deadlines" items={output.deadlines} />
            <ListCard title="Important Details" items={output.importantDetails} />
            <ListCard title="Unclear Parts" items={output.unclearParts} />

            <OutputCard
              title="Raw Transcript"
              content={output.rawTranscript}
              onCopy={() => copyText(output.rawTranscript)}
            />
          </div>
        )}
      </section>
    </main>
  );
}

function OutputCard({
  title,
  content,
  onCopy,
}: {
  title: string;
  content: string;
  onCopy: () => void;
}) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold">{title}</h2>

        <button
          onClick={onCopy}
          className="rounded-xl border border-zinc-700 px-3 py-2 text-sm text-zinc-300 hover:border-cyan-400 hover:text-cyan-300"
        >
          Copy
        </button>
      </div>

      <pre className="whitespace-pre-wrap rounded-2xl bg-zinc-950 p-4 text-sm leading-7 text-zinc-300">
        {content || "No output."}
      </pre>
    </section>
  );
}

function ListCard({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="rounded-3xl border border-zinc-800 bg-zinc-900/60 p-6">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>

      {items.length > 0 ? (
        <ul className="space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="rounded-2xl bg-zinc-950 p-4 text-sm leading-6 text-zinc-300"
            >
              {index + 1}. {item}
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-2xl bg-zinc-950 p-4 text-sm text-zinc-500">
          None found.
        </p>
      )}
    </section>
  );
}