# EchoBrief v3.0.0

EchoBrief v3 turns the project from a small transcription utility into a more complete audio and video intelligence workflow.

## Highlights

- Complete dark studio-style UI redesign
- Dedicated Notes Mode and Timestamp Mode
- Real word-level timestamp transcription
- Gemini transcription through the Interactions API
- Separate transcription and structured-analysis model responsibilities
- Automatic model retries and fallbacks
- Streaming multipart uploads instead of buffering huge files in memory
- Multi-gigabyte video handling
- Automatic video → speech-optimized MP3 extraction with FFmpeg
- 16 kHz mono 64 kbps speech audio
- Automatic long-audio chunking
- Continuous timestamp reconstruction across chunks
- Automatic cleanup of temporary videos, audio, and chunks
- Multi-file ordering and queue controls
- Improved copy/download output workflow
- Updated metadata and EchoBrief product positioning

## Large-media pipeline

```text
Large video
→ stream to disk
→ extract compressed speech MP3
→ remove original temporary video
→ split audio into safe chunks
→ transcribe chunks
→ restore absolute timestamps
→ merge output
```

This release was specifically hardened for long and very large media instead of assuming every upload is a small voice note.

## Notes

Processing limits can still depend on the environment running EchoBrief, including temporary disk space, request duration, memory, and hosting-provider limits.
