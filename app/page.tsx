"use client";

import { useMemo, useState } from "react";

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

type OutputTab =
  | "timestamps"
  | "summary"
  | "clean"
  | "translation"
  | "tasks"
  | "details"
  | "raw";

export default function Home() {
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [output, setOutput] = useState<EchoBriefOutput | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"notes" | "timestamps">("notes");
  const [activeTab, setActiveTab] = useState<OutputTab>("summary");
  const [copied, setCopied] = useState("");


  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const selectedFiles = Array.from(event.target.files || []);

    setFiles((current) => [...current, ...selectedFiles]);
    setOutput(null);
    setError("");

    event.target.value = "";
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

  function clearFiles() {
    setFiles([]);
    setOutput(null);
    setError("");
  }

  function changeMode(nextMode: "notes" | "timestamps") {
    setMode(nextMode);
    setOutput(null);
    setError("");
    setActiveTab(nextMode === "timestamps" ? "timestamps" : "summary");
  }

  async function handleProcessAudio() {
    if (files.length === 0) {
      setError("Add at least one audio or video file first.");
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

      formData.append("mode", mode);

      const response = await fetch("/api/process-audio", {
        method: "POST",
        body: formData,
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Something went wrong while processing.");
      }

      setOutput(data);
      setActiveTab(mode === "timestamps" ? "timestamps" : "summary");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error occurred.");
    } finally {
      setIsProcessing(false);
    }
  }

  async function copyText(text: string, label = "Copied") {
    await navigator.clipboard.writeText(text);
    setCopied(label);

    window.setTimeout(() => {
      setCopied("");
    }, 1600);
  }

  function downloadTextFile(filename: string, text: string) {
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();

    URL.revokeObjectURL(url);
  }

  const aiReadyText = useMemo(() => {
    if (!output) return "";

    const timestampSection =
      output.mode === "timestamps" && output.timestampedTranscript
        ? `Timestamped Transcript:\n${output.timestampedTranscript}\n\n`
        : "";

    return `EchoBrief Output

${timestampSection}Summary:
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
${output.importantDetails
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n")}

Unclear Parts:
${output.unclearParts
        .map((item, index) => `${index + 1}. ${item}`)
        .join("\n")}
`;
  }, [output]);

  const tabs: { id: OutputTab; label: string; show: boolean }[] = [
    {
      id: "timestamps",
      label: "Timestamps",
      show: output?.mode === "timestamps" && Boolean(output.timestampedTranscript),
    },
    { id: "summary", label: "Summary", show: true },
    { id: "clean", label: "Clean Transcript", show: true },
    { id: "translation", label: "Translation", show: true },
    { id: "tasks", label: "Tasks", show: true },
    { id: "details", label: "Details", show: true },
    { id: "raw", label: "Raw", show: true },
  ];

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#050608] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-18rem] h-[38rem] w-[38rem] -translate-x-1/2 rounded-full bg-cyan-400/[0.09] blur-[140px]" />
        <div className="absolute right-[-14rem] top-[26rem] h-[30rem] w-[30rem] rounded-full bg-blue-500/[0.07] blur-[150px]" />
        <div className="absolute bottom-[-20rem] left-[-12rem] h-[34rem] w-[34rem] rounded-full bg-cyan-300/[0.05] blur-[150px]" />
        <div
          className="absolute inset-0 opacity-[0.035]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(255,255,255,.18) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.18) 1px, transparent 1px)",
            backgroundSize: "48px 48px",
            maskImage:
              "linear-gradient(to bottom, black, transparent 78%)",
          }}
        />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 pb-16 pt-5 sm:px-6 lg:px-8">
        <Header />

        <section className="mx-auto max-w-5xl pb-10 pt-16 text-center sm:pt-20">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-cyan-300/15 bg-cyan-300/[0.06] px-3 py-1.5 text-xs font-medium text-cyan-200">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-cyan-300 opacity-40" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-cyan-300" />
            </span>
            EchoBrief v3
          </div>

          <h1 className="mx-auto max-w-4xl text-balance text-4xl font-semibold tracking-[-0.045em] text-zinc-50 sm:text-6xl lg:text-7xl">
            Hear it once.
            <span className="block bg-gradient-to-r from-cyan-200 via-cyan-300 to-blue-400 bg-clip-text text-transparent">
              Find it forever.
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-pretty text-base leading-7 text-zinc-400 sm:text-lg">
            Drop in voice notes, recordings, or videos. EchoBrief turns them
            into structured notes or editor-ready timestamped transcripts.
          </p>
        </section>

        <section className="mx-auto max-w-5xl">
          <ModeSelector mode={mode} onChange={changeMode} />

          <div className="mt-4 overflow-hidden rounded-[28px] border border-white/[0.08] bg-white/[0.035] shadow-[0_30px_100px_rgba(0,0,0,.42)] backdrop-blur-xl">
            <div className="border-b border-white/[0.06] px-5 py-4 sm:px-7">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium text-zinc-100">
                    {mode === "notes"
                      ? "Build a clean brief"
                      : "Build an editing transcript"}
                  </p>
                  <p className="mt-1 text-xs text-zinc-500">
                    {mode === "notes"
                      ? "Transcribe, clean, translate, summarize, and extract what matters."
                      : "Extract audio, transcribe speech, and map it to real word timestamps."}
                  </p>
                </div>

                <div className="flex items-center gap-2 text-xs text-zinc-500">
                  <StatusPill label="Audio" />
                  <StatusPill label="Video" />
                  <StatusPill label="Multi-file" />
                </div>
              </div>
            </div>

            <div className="p-5 sm:p-7">
              <label className="group relative flex min-h-[230px] cursor-pointer flex-col items-center justify-center overflow-hidden rounded-[22px] border border-dashed border-white/[0.12] bg-black/25 px-6 py-12 text-center transition duration-300 hover:border-cyan-300/45 hover:bg-cyan-300/[0.035]">
                <div className="absolute inset-x-16 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/40 to-transparent opacity-0 transition group-hover:opacity-100" />

                <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-cyan-200/15 bg-cyan-300/[0.08] text-cyan-200 shadow-[0_0_45px_rgba(34,211,238,.09)] transition duration-300 group-hover:scale-105 group-hover:bg-cyan-300/[0.12]">
                  <UploadIcon />
                </div>

                <span className="text-base font-medium text-zinc-100">
                  Drop media here or browse
                </span>

                <span className="mt-2 max-w-md text-sm leading-6 text-zinc-500">
                  MP3, WAV, M4A, WEBM, OGG, OPUS, MP4, MOV, or MKV
                </span>

                <span className="mt-5 rounded-full border border-white/[0.07] bg-white/[0.04] px-3 py-1 text-[11px] uppercase tracking-[0.18em] text-zinc-500">
                  Multiple files supported
                </span>

                <input
                  type="file"
                  accept="audio/*,video/*,.ogg,.opus,.mp4,.mov,.mkv"
                  multiple
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {files.length > 0 && (
                <div className="mt-7">
                  <div className="mb-3 flex items-end justify-between gap-4">
                    <div>
                      <p className="text-sm font-medium text-zinc-200">
                        Media queue
                      </p>
                      <p className="mt-1 text-xs text-zinc-500">
                        EchoBrief processes these from top to bottom.
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={clearFiles}
                      disabled={isProcessing}
                      className="text-xs text-zinc-500 transition hover:text-zinc-200 disabled:cursor-not-allowed disabled:opacity-40"
                    >
                      Clear all
                    </button>
                  </div>

                  <div className="space-y-2">
                    {files.map((file, index) => {
                      const kind = getMediaKind(file);

                      return (
                        <div
                          key={`${file.name}-${file.lastModified}-${index}`}
                          className="group flex items-center gap-3 rounded-2xl border border-white/[0.065] bg-black/30 p-3 transition hover:border-white/[0.11] hover:bg-white/[0.035]"
                        >
                          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/[0.07] bg-white/[0.04] text-zinc-400">
                            {kind === "VIDEO" ? <VideoIcon /> : <AudioIcon />}
                          </div>

                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="rounded-md bg-cyan-300/[0.08] px-1.5 py-0.5 text-[9px] font-semibold tracking-widest text-cyan-300">
                                {kind}
                              </span>

                              <p className="truncate text-sm font-medium text-zinc-200">
                                {file.name}
                              </p>
                            </div>

                            <div className="mt-1 flex items-center gap-2 text-[11px] text-zinc-600">
                              <span>#{index + 1}</span>
                              <span>•</span>
                              <span>{formatFileSize(file.size)}</span>
                            </div>
                          </div>

                          <div className="flex shrink-0 items-center gap-1">
                            <QueueButton
                              label="↑"
                              title="Move up"
                              onClick={() => moveFileUp(index)}
                              disabled={index === 0 || isProcessing}
                            />
                            <QueueButton
                              label="↓"
                              title="Move down"
                              onClick={() => moveFileDown(index)}
                              disabled={index === files.length - 1 || isProcessing}
                            />
                            <QueueButton
                              label="×"
                              title="Remove"
                              danger
                              onClick={() => removeFile(index)}
                              disabled={isProcessing}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {error && (
                <div className="mt-5 rounded-2xl border border-red-400/15 bg-red-400/[0.06] px-4 py-3 text-sm leading-6 text-red-200">
                  {error}
                </div>
              )}

              {isProcessing && (
                <div className="mt-6 overflow-hidden rounded-2xl border border-cyan-300/10 bg-cyan-300/[0.04] p-4">
                  <div className="flex items-center justify-between gap-3 text-sm">
                    <div className="flex items-center gap-3 text-zinc-200">
                      <Spinner />
                      <span>
                        {mode === "timestamps"
                          ? "Transcribing and mapping timestamps…"
                          : "Turning your audio into a brief…"}
                      </span>
                    </div>
                    <span className="hidden text-xs text-zinc-500 sm:inline">
                      {files.length} {files.length === 1 ? "file" : "files"}
                    </span>
                  </div>

                  <div className="mt-4 h-1 overflow-hidden rounded-full bg-white/[0.05]">
                    <div className="h-full w-1/3 animate-[echobrief-progress_1.4s_ease-in-out_infinite] rounded-full bg-gradient-to-r from-cyan-300 to-blue-400" />
                  </div>
                </div>
              )}

              <button
                onClick={handleProcessAudio}
                disabled={isProcessing || files.length === 0}
                className="group mt-6 flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-cyan-300 to-cyan-400 px-6 py-4 text-sm font-semibold text-zinc-950 shadow-[0_12px_50px_rgba(34,211,238,.12)] transition duration-300 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-35"
              >
                {isProcessing ? (
                  <>
                    <Spinner dark />
                    Processing
                  </>
                ) : (
                  <>
                    {mode === "notes" ? "Create Brief" : "Create Timestamp Transcript"}
                    <ArrowIcon />
                  </>
                )}
              </button>
            </div>
          </div>
        </section>

        {output && (
          <section className="mx-auto mt-10 max-w-6xl">
            <div className="mb-4 flex flex-col gap-4 rounded-[24px] border border-cyan-300/10 bg-cyan-300/[0.045] p-5 backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-start gap-3">
                <div className="mt-0.5 flex h-9 w-9 items-center justify-center rounded-xl bg-cyan-300/[0.1] text-cyan-300">
                  <CheckIcon />
                </div>
                <div>
                  <h2 className="text-sm font-semibold text-zinc-100">
                    Your brief is ready
                  </h2>
                  <p className="mt-1 text-xs leading-5 text-zinc-500">
                    Copy the complete AI-ready version or work through individual
                    views below.
                  </p>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => copyText(aiReadyText, "All copied")}
                  className="rounded-xl border border-white/[0.08] bg-white/[0.04] px-4 py-2.5 text-xs font-medium text-zinc-200 transition hover:border-cyan-300/25 hover:text-cyan-200"
                >
                  {copied === "All copied" ? "Copied ✓" : "Copy all"}
                </button>

                <button
                  onClick={() =>
                    downloadTextFile("echobrief-output.txt", aiReadyText)
                  }
                  className="rounded-xl bg-cyan-300 px-4 py-2.5 text-xs font-semibold text-zinc-950 transition hover:bg-cyan-200"
                >
                  Download .txt
                </button>
              </div>
            </div>

            <div className="grid gap-4 lg:grid-cols-[230px_minmax(0,1fr)]">
              <aside className="h-fit rounded-[24px] border border-white/[0.07] bg-white/[0.03] p-2 backdrop-blur-xl">
                <div className="px-3 pb-2 pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-zinc-600">
                    Output
                  </p>
                </div>

                <div className="space-y-1">
                  {tabs
                    .filter((tab) => tab.show)
                    .map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex w-full items-center justify-between rounded-xl px-3 py-2.5 text-left text-sm transition ${activeTab === tab.id
                            ? "bg-cyan-300/[0.09] text-cyan-200"
                            : "text-zinc-500 hover:bg-white/[0.035] hover:text-zinc-200"
                          }`}
                      >
                        <span>{tab.label}</span>
                        {activeTab === tab.id && (
                          <span className="h-1.5 w-1.5 rounded-full bg-cyan-300" />
                        )}
                      </button>
                    ))}
                </div>
              </aside>

              <div className="min-w-0 rounded-[24px] border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-xl sm:p-7">
                <OutputView
                  output={output}
                  activeTab={activeTab}
                  copied={copied}
                  onCopy={copyText}
                />
              </div>
            </div>
          </section>
        )}

        <footer className="mx-auto mt-16 flex max-w-5xl flex-col items-center justify-between gap-3 border-t border-white/[0.06] py-7 text-xs text-zinc-600 sm:flex-row">
          <p>EchoBrief v3 • built for things worth hearing twice.</p>
          <p>Audio → context → clarity</p>
        </footer>
      </div>
    </main>
  );
}

function Header() {
  return (
    <header className="flex h-14 items-center justify-between rounded-2xl border border-white/[0.06] bg-white/[0.025] px-4 backdrop-blur-xl sm:px-5">
      <div className="flex items-center gap-3">
        <EchoMark />
        <div>
          <p className="text-sm font-semibold tracking-[-0.02em] text-zinc-100">
            EchoBrief
          </p>
          <p className="text-[10px] tracking-[0.12em] text-zinc-600">
            MEDIA INTELLIGENCE
          </p>
        </div>
      </div>

      <div className="hidden items-center gap-2 sm:flex">
        <span className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] text-zinc-500">
          NOTES
        </span>
        <span className="rounded-full border border-white/[0.06] px-2.5 py-1 text-[10px] text-zinc-500">
          TIMESTAMPS
        </span>
      </div>
    </header>
  );
}

function ModeSelector({
  mode,
  onChange,
}: {
  mode: "notes" | "timestamps";
  onChange: (mode: "notes" | "timestamps") => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <button
        type="button"
        onClick={() => onChange("notes")}
        className={`relative overflow-hidden rounded-[22px] border p-5 text-left transition duration-300 ${mode === "notes"
            ? "border-cyan-300/30 bg-cyan-300/[0.07] shadow-[0_18px_60px_rgba(34,211,238,.06)]"
            : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.04]"
          }`}
      >
        {mode === "notes" && (
          <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        )}

        <div className="flex items-start justify-between gap-5">
          <div className="flex gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${mode === "notes"
                  ? "border-cyan-300/15 bg-cyan-300/[0.09] text-cyan-300"
                  : "border-white/[0.06] bg-white/[0.035] text-zinc-500"
                }`}
            >
              <NotesIcon />
            </div>

            <div>
              <p
                className={`text-sm font-semibold ${mode === "notes" ? "text-cyan-100" : "text-zinc-200"
                  }`}
              >
                Notes Mode
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                Clean transcript, translation, summary, tasks, deadlines, and
                important details.
              </p>
            </div>
          </div>

          <ModeDot active={mode === "notes"} />
        </div>
      </button>

      <button
        type="button"
        onClick={() => onChange("timestamps")}
        className={`relative overflow-hidden rounded-[22px] border p-5 text-left transition duration-300 ${mode === "timestamps"
            ? "border-cyan-300/30 bg-cyan-300/[0.07] shadow-[0_18px_60px_rgba(34,211,238,.06)]"
            : "border-white/[0.07] bg-white/[0.025] hover:border-white/[0.12] hover:bg-white/[0.04]"
          }`}
      >
        {mode === "timestamps" && (
          <div className="absolute inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-cyan-300/70 to-transparent" />
        )}

        <div className="flex items-start justify-between gap-5">
          <div className="flex gap-3">
            <div
              className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${mode === "timestamps"
                  ? "border-cyan-300/15 bg-cyan-300/[0.09] text-cyan-300"
                  : "border-white/[0.06] bg-white/[0.035] text-zinc-500"
                }`}
            >
              <TimestampIcon />
            </div>

            <div>
              <p
                className={`text-sm font-semibold ${mode === "timestamps" ? "text-cyan-100" : "text-zinc-200"
                  }`}
              >
                Timestamp Mode
              </p>
              <p className="mt-1 max-w-sm text-xs leading-5 text-zinc-500">
                Word-timed transcription shaped into editor-friendly sections
                for YouTube and video workflows.
              </p>
            </div>
          </div>

          <ModeDot active={mode === "timestamps"} />
        </div>
      </button>
    </div>
  );
}

function OutputView({
  output,
  activeTab,
  copied,
  onCopy,
}: {
  output: EchoBriefOutput;
  activeTab: OutputTab;
  copied: string;
  onCopy: (text: string, label?: string) => Promise<void>;
}) {
  if (activeTab === "timestamps") {
    return (
      <TextOutput
        eyebrow="EDITOR VIEW"
        title="Timestamped Transcript"
        description="Sentence-level sections built from the transcription model's word timing."
        content={output.timestampedTranscript || ""}
        mono
        copied={copied}
        onCopy={onCopy}
      />
    );
  }

  if (activeTab === "summary") {
    return (
      <TextOutput
        eyebrow="AT A GLANCE"
        title="Summary"
        description="The shortest useful version of what was actually said."
        content={output.summary}
        copied={copied}
        onCopy={onCopy}
      />
    );
  }

  if (activeTab === "clean") {
    return (
      <TextOutput
        eyebrow="READABLE VERSION"
        title="Clean Transcript"
        description="Punctuated and structured without losing the original meaning."
        content={output.cleanTranscript}
        copied={copied}
        onCopy={onCopy}
      />
    );
  }

  if (activeTab === "translation") {
    return (
      <TextOutput
        eyebrow="ENGLISH"
        title="Translation"
        description="A clear English rendering of the full meaning."
        content={output.englishTranslation}
        copied={copied}
        onCopy={onCopy}
      />
    );
  }

  if (activeTab === "tasks") {
    return (
      <div>
        <OutputHeading
          eyebrow="ACTIONABLE"
          title="Tasks & Deadlines"
          description="Anything that sounds like something somebody needs to do or remember."
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ListPanel title="Action Items" items={output.actionItems} />
          <ListPanel title="Deadlines" items={output.deadlines} />
        </div>
      </div>
    );
  }

  if (activeTab === "details") {
    return (
      <div>
        <OutputHeading
          eyebrow="CONTEXT"
          title="Details"
          description="Requirements, constraints, names, and uncertain sections worth checking."
        />

        <div className="mt-6 grid gap-4 md:grid-cols-2">
          <ListPanel title="Important Details" items={output.importantDetails} />
          <ListPanel title="Unclear Parts" items={output.unclearParts} />
        </div>
      </div>
    );
  }

  return (
    <TextOutput
      eyebrow="SOURCE"
      title="Raw Transcript"
      description="The closest readable representation of what was spoken."
      content={output.rawTranscript}
      copied={copied}
      onCopy={onCopy}
    />
  );
}

function TextOutput({
  eyebrow,
  title,
  description,
  content,
  mono = false,
  copied,
  onCopy,
}: {
  eyebrow: string;
  title: string;
  description: string;
  content: string;
  mono?: boolean;
  copied: string;
  onCopy: (text: string, label?: string) => Promise<void>;
}) {
  const copyLabel = `${title} copied`;

  return (
    <div>
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <OutputHeading
          eyebrow={eyebrow}
          title={title}
          description={description}
        />

        <button
          type="button"
          onClick={() => onCopy(content, copyLabel)}
          className="shrink-0 rounded-xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2 text-xs font-medium text-zinc-400 transition hover:border-cyan-300/25 hover:text-cyan-200"
        >
          {copied === copyLabel ? "Copied ✓" : "Copy"}
        </button>
      </div>

      <div
        className={`mt-6 max-h-[650px] overflow-y-auto whitespace-pre-wrap rounded-2xl border border-white/[0.055] bg-black/30 p-5 text-sm leading-7 text-zinc-300 ${mono ? "font-mono text-[13px]" : ""
          }`}
      >
        {content || <span className="text-zinc-600">No output found.</span>}
      </div>
    </div>
  );
}

function OutputHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="text-[10px] font-semibold tracking-[0.2em] text-cyan-300/65">
        {eyebrow}
      </p>
      <h2 className="mt-2 text-xl font-semibold tracking-[-0.025em] text-zinc-100">
        {title}
      </h2>
      <p className="mt-1.5 max-w-xl text-xs leading-5 text-zinc-500">
        {description}
      </p>
    </div>
  );
}

function ListPanel({ title, items }: { title: string; items: string[] }) {
  return (
    <div className="rounded-2xl border border-white/[0.055] bg-black/25 p-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-200">{title}</h3>
        <span className="rounded-md bg-white/[0.04] px-2 py-1 text-[10px] text-zinc-600">
          {items.length}
        </span>
      </div>

      {items.length > 0 ? (
        <ul className="mt-4 space-y-2">
          {items.map((item, index) => (
            <li
              key={`${item}-${index}`}
              className="flex gap-3 rounded-xl border border-white/[0.045] bg-white/[0.025] px-3.5 py-3 text-xs leading-5 text-zinc-400"
            >
              <span className="mt-0.5 text-[10px] font-semibold text-cyan-300/70">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-4 rounded-xl border border-white/[0.04] bg-white/[0.02] px-3.5 py-4 text-xs text-zinc-600">
          Nothing found.
        </p>
      )}
    </div>
  );
}

function StatusPill({ label }: { label: string }) {
  return (
    <span className="rounded-full border border-white/[0.06] bg-white/[0.025] px-2.5 py-1">
      {label}
    </span>
  );
}

function QueueButton({
  label,
  title,
  onClick,
  disabled,
  danger = false,
}: {
  label: string;
  title: string;
  onClick: () => void;
  disabled: boolean;
  danger?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      onClick={onClick}
      disabled={disabled}
      className={`flex h-8 w-8 items-center justify-center rounded-lg border text-sm transition disabled:cursor-not-allowed disabled:opacity-20 ${danger
          ? "border-red-400/10 text-zinc-600 hover:border-red-400/25 hover:bg-red-400/[0.06] hover:text-red-300"
          : "border-white/[0.06] text-zinc-600 hover:border-cyan-300/20 hover:bg-cyan-300/[0.05] hover:text-cyan-200"
        }`}
    >
      {label}
    </button>
  );
}

function ModeDot({ active }: { active: boolean }) {
  return (
    <span
      className={`mt-1 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${active
          ? "border-cyan-300 bg-cyan-300"
          : "border-zinc-700 bg-transparent"
        }`}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-zinc-950" />}
    </span>
  );
}

function EchoMark() {
  return (
    <div className="relative flex h-9 w-9 items-center justify-center rounded-xl border border-cyan-300/15 bg-cyan-300/[0.08] text-cyan-200 shadow-[0_0_30px_rgba(34,211,238,.08)]">
      <svg
        viewBox="0 0 32 32"
        className="h-5 w-5"
        fill="none"
        aria-hidden="true"
      >
        <path
          d="M9 10v12M13 7v18M17 11v10M21 5v22M25 10v12"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
        />
      </svg>
    </div>
  );
}

function UploadIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" aria-hidden="true">
      <path
        d="M12 16V5m0 0L8 9m4-4 4 4M5 15v3a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function AudioIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M6 10v4M10 7v10M14 5v14M18 9v6"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <rect
        x="3.5"
        y="5"
        width="13"
        height="14"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="m16.5 10 4-2v8l-4-2"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function NotesIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="M7 4.5h7l3 3V19a1.5 1.5 0 0 1-1.5 1.5h-8A1.5 1.5 0 0 1 6 19V6a1.5 1.5 0 0 1 1-1.5Z"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M14 4.5V8h3.5M9 12h6M9 15.5h5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

function TimestampIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <circle
        cx="12"
        cy="12"
        r="8"
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <path
        d="M12 8v4l2.7 1.7M9 2.8h6"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" aria-hidden="true">
      <path
        d="m7 12.5 3.2 3L17 8.8"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" aria-hidden="true">
      <path
        d="M5 12h14m0 0-5-5m5 5-5 5"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function Spinner({ dark = false }: { dark?: boolean }) {
  return (
    <span
      className={`h-4 w-4 animate-spin rounded-full border-2 ${dark
          ? "border-zinc-950/25 border-t-zinc-950"
          : "border-cyan-200/20 border-t-cyan-200"
        }`}
    />
  );
}

function getMediaKind(file: File): "AUDIO" | "VIDEO" {
  if (file.type.startsWith("video/")) return "VIDEO";

  const extension = file.name.split(".").pop()?.toLowerCase();

  if (["mp4", "mov", "mkv"].includes(extension || "")) {
    return "VIDEO";
  }

  return "AUDIO";
}

function formatFileSize(bytes: number) {
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(0)} KB`;
  }

  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}
