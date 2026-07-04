import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "EchoBrief",
    template: "%s | EchoBrief",
  },
  description:
    "EchoBrief turns messy voice notes, audio files, and videos into clean transcripts, summaries, translations, action items, and timestamped editing notes.",
  keywords: [
    "EchoBrief",
    "voice note transcriber",
    "AI transcription",
    "audio to text",
    "video transcription",
    "timestamped transcript",
    "Gemini API",
    "YouTube editing tool",
    "AI notes",
  ],
  authors: [
    {
      name: "Talal Nadeem Awan",
    },
  ],
  creator: "Talal Nadeem Awan",
  applicationName: "EchoBrief",
  metadataBase: new URL("http://localhost:3000"),
  openGraph: {
    title: "EchoBrief",
    description:
      "Turn voice notes, audio files, and videos into clean AI-ready transcripts, summaries, translations, and timestamped editing notes.",
    type: "website",
    siteName: "EchoBrief",
  },
  twitter: {
    card: "summary_large_image",
    title: "EchoBrief",
    description:
      "Clean transcripts, summaries, translations, action items, and timestamped editing notes from messy audio.",
  },
  icons: {
    icon: "/favicon.ico",
  },
  themeColor: "#22d3ee",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full scroll-smooth antialiased`}
    >
      <body className="min-h-full bg-zinc-950 text-zinc-100 selection:bg-cyan-300 selection:text-zinc-950">
        <div className="pointer-events-none fixed inset-0 -z-10 bg-[radial-gradient(circle_at_top_left,rgba(34,211,238,0.16),transparent_32%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.12),transparent_30%)]" />

        <div className="flex min-h-screen flex-col">
          {children}
        </div>
      </body>
    </html>
  );
}