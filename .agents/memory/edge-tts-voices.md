---
name: edge-tts available voices
description: Which en-US voices actually exist in edge-tts; several documented voices are NOT available.
---

## Rule
Only use voices returned by `edge_tts.list_voices()`. Never hardcode voice names from external docs without verifying.

**Why:** `en-US-DavisNeural` and `en-GB-SoniaNeural` were listed in the UI but don't exist in the edge-tts service. This caused 100% of audio files to be 0 bytes (NoAudioReceived exception), silently, because edge-tts wrote the file before failing.

## Verified en-US voices (as of June 2026)
- en-US-AriaNeural (Female)
- en-US-AvaNeural (Female)
- en-US-EmmaNeural (Female)
- en-US-JennyNeural (Female)
- en-US-MichelleNeural (Female)
- en-US-AndrewNeural (Male)
- en-US-BrianNeural (Male)
- en-US-ChristopherNeural (Male)
- en-US-EricNeural (Male)
- en-US-GuyNeural (Male)
- en-US-RogerNeural (Male)
- en-US-SteffanNeural (Male)

## How to apply
- Keep VOICES list in `server/pipeline/voiceover.ts` and `src/components/TopicInput.tsx` in sync and limited to the above.
- After edge-tts runs, validate file size ≥ 100 bytes (added to `runEdgeTts`) to catch silent failures early.
