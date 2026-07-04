# EchoBrief

EchoBrief is an AI-powered transcription and audio processing tool that turns messy voice notes, audio files, and videos into clean, readable, AI-ready text.

It supports multi-file uploads, manual file ordering, voice note transcription, English translation, summaries, action items, deadlines, important details, unclear parts, and timestamped transcripts for YouTube/video editing.

## Features

- Upload multiple audio, voice note, or video files
- Manually arrange files in the correct listening order
- Supports common audio formats like MP3, WAV, M4A, WEBM, OGG, and OPUS
- Supports video files like MP4, MOV, and MKV
- Converts WhatsApp-style OGG/OPUS voice notes using FFmpeg
- Extracts MP3 audio from video files using FFmpeg
- Uses Gemini API for audio analysis and transcription
- Includes two processing modes:
  - Notes Mode
  - Timestamp Mode
- Generates:
  - Raw transcript
  - Clean transcript
  - English translation
  - Summary
  - Action items
  - Deadlines
  - Important details
  - Unclear parts
  - Timestamped transcript for editing
- Copy output to clipboard
- Download AI-ready output as a TXT file

## Modes

### Notes Mode

Notes Mode is designed for voice notes, meetings, lectures, client messages, and general audio files.

It generates structured output such as:

- Raw transcript
- Clean transcript
- English translation
- Summary
- Action items
- Deadlines
- Important details
- Unclear parts

### Timestamp Mode

Timestamp Mode is designed for YouTube videos, video editing, podcasts, and long-form recordings.

It generates a sentence-by-sentence timestamped transcript like this:

```txt
[00:00] - [00:05] This is the first sentence.
[00:05] - [00:11] This is the next sentence.
[00:11] - [00:18] This section explains the main idea.

This makes it easier to find important lines, hooks, mistakes, sections, pauses, and editing points inside a video.

Tech Stack
Next.js
TypeScript
Tailwind CSS
Gemini API
FFmpeg
fluent-ffmpeg
ffmpeg-static
Getting Started
1. Clone the repository
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
The user uploads one or more audio or video files.
The user arranges the files in the correct listening order.
The user selects either Notes Mode or Timestamp Mode.
EchoBrief sends the files to the backend through a Next.js API route.
The backend temporarily saves the uploaded files.
OGG/OPUS files are converted to MP3 using FFmpeg.
Video files like MP4, MOV, and MKV are converted to MP3 audio using FFmpeg.
The prepared audio is uploaded/sent to Gemini.
Gemini analyzes the audio and returns structured JSON.
EchoBrief displays the transcript, summary, translation, tasks, deadlines, important details, unclear parts, and timestamped transcript when selected.
The user can copy the output or download it as a TXT file.
Supported File Formats

EchoBrief is designed to support:

.mp3
.wav
.m4a
.webm
.ogg
.opus
.mp4
.mov
.mkv

OGG and OPUS files are converted to MP3 before being sent to Gemini.

Video files are processed by extracting the audio as MP3 before transcription.

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
Main Files
app/page.tsx

This file contains the frontend interface.

It handles:

File uploads
File ordering
Mode selection
Sending files to the backend
Displaying results
Copying output
Downloading TXT output
app/api/process-audio/route.ts

This file contains the backend processing logic.

It handles:

Receiving uploaded files
Temporarily saving files
Converting OGG/OPUS audio to MP3
Extracting MP3 audio from video files
Sending prepared audio to Gemini
Parsing Gemini JSON output
Merging results from multiple files
Returning structured output to the frontend
Why EchoBrief Exists

Voice notes and long recordings are hard to search, organize, summarize, or give to AI models.

EchoBrief solves this by turning messy audio into structured written output. It is useful for:

Students
Freelancers
Content creators
YouTube editors
Meeting notes
Client voice notes
Podcasts
Lectures
Multilingual audio messages
Notes
This project is currently built as a local MVP.
Uploaded files are temporarily processed by the backend.
API keys should always be stored in environment variables.
Large audio or video files may take longer to process.
Multi-file processing depends on the order selected by the user before clicking Process Audio.
Timestamp accuracy depends on Gemini’s audio understanding and may not be frame-perfect.
For professional subtitle-level timing, a dedicated timestamp transcription model can be added later.
Future Improvements
Drag-and-drop file ordering
Progress indicator for each file
DOCX export
PDF export
SRT subtitle export
VTT subtitle export
Speaker detection
Word-level timestamps
Saved transcript history
Authentication
Cloud storage support
Project folders for creators and editors
Direct YouTube workflow exports
License

This project is for personal and educational use.