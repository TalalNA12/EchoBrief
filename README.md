# EchoBrief

EchoBrief is a simple AI-powered voice note tool that turns messy audio into clean, readable, AI-ready text.

It lets you upload multiple voice notes, arrange them in the correct order, and process them into transcripts, English translations, summaries, action items, deadlines, and important details.

## Features

- Upload multiple audio files
- Manually arrange voice notes in the correct order
- Supports common audio formats like MP3, WAV, M4A, WEBM, OGG, and OPUS
- Converts WhatsApp-style OGG/OPUS voice notes using FFmpeg
- Uses Gemini API for audio analysis and transcription
- Generates:
  - Raw transcript
  - Clean transcript
  - English translation
  - Summary
  - Action items
  - Deadlines
  - Important details
  - Unclear parts
- Copy output to clipboard
- Download AI-ready output as a TXT file

## Tech Stack

- Next.js
- TypeScript
- Tailwind CSS
- Gemini API
- FFmpeg
- fluent-ffmpeg
- ffmpeg-static

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/YOUR_USERNAME/echobrief.git
cd echobrief
2. Install dependencies
npm install
3. Set up environment variables

Create a .env.local file in the root directory:

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

You can get a Gemini API key from Google AI Studio.

4. Run the development server
npm run dev

Then open:

http://localhost:3000
How It Works
The user uploads one or more audio files.
The user arranges the files in the correct listening order.
EchoBrief sends the files to the backend.
OGG/OPUS files are converted to MP3 using FFmpeg.
The processed audio is sent to Gemini.
Gemini returns structured output.
EchoBrief displays the transcript, summary, translation, tasks, deadlines, and important details.
Supported Audio Formats

EchoBrief is designed to support:

.mp3
.wav
.m4a
.webm
.ogg
.opus

OGG and OPUS files are converted before being sent to Gemini.

Project Structure
echobrief/
├── app/
│   ├── api/
│   │   └── process-audio/
│   │       └── route.ts
│   ├── page.tsx
│   └── layout.tsx
├── public/
├── .env.example
├── .gitignore
├── package.json
└── README.md
Environment Variables

Create a .env.local file:

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

Do not commit .env.local to GitHub.

You can also create a safe .env.example file:

GEMINI_API_KEY=your_gemini_api_key_here
GEMINI_MODEL=gemini-2.5-flash

Notes
This project is currently built as a local MVP.
Uploaded files are temporarily processed by the backend.
API keys should always be stored in environment variables.
Large audio files may take longer to process.
Multi-file processing depends on the order selected by the user before clicking Process Audio.
Future Improvements
Drag-and-drop file ordering
Progress indicator for each file
DOCX export
PDF export
Speaker detection
Timestamped transcripts
Saved transcript history
Authentication
Cloud storage support
License

This project is for personal and educational use.