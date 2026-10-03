import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
  display: "swap",
});

const appUrl =
  process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl),

  title: {
    default: "EchoBrief | Audio & Video Intelligence",
    template: "%s | EchoBrief",
  },

  description:
    "Turn voice notes, recordings, and videos into clean transcripts, structured briefs, translations, action items, and editor-ready timestamped transcripts.",

  applicationName: "EchoBrief",

  keywords: [
    "EchoBrief",
    "AI transcription",
    "audio to text",
    "video transcription",
    "voice note transcription",
    "timestamped transcript",
    "YouTube editing tool",
    "audio intelligence",
    "video intelligence",
    "Gemini transcription",
    "FFmpeg",
  ],

  authors: [
    {
      name: "Talal Nadeem Awan",
    },
  ],

  creator: "Talal Nadeem Awan",

  openGraph: {
    title: "EchoBrief | Audio & Video Intelligence",
    description:
      "Hear it once. Find it forever. Turn audio and video into structured notes or editor-ready timestamped transcripts.",
    type: "website",
    siteName: "EchoBrief",
    url: appUrl,
  },

  twitter: {
    card: "summary_large_image",
    title: "EchoBrief | Audio & Video Intelligence",
    description:
      "Turn audio and video into structured notes, clean transcripts, and editor-ready timestamps.",
  },

  icons: {
    icon: [
      {
        url: "/favicon.ico",
        sizes: "any",
      },
    ],
    shortcut: "/favicon.ico",
  },

  category: "technology",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#050608",
  colorScheme: "dark",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full bg-[#050608] antialiased`}
    >
      <body className="min-h-full bg-[#050608] font-sans text-zinc-100 selection:bg-cyan-300 selection:text-zinc-950">
        {children}
      </body>
    </html>
  );
}
