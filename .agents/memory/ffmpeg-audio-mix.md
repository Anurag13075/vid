---
name: FFmpeg audio mixing
description: Critical rule about audio filter graphs — apad causes infinite stream hangs
---

**Rule:** Never use `apad` in an FFmpeg audio filter graph for final video mixing.

**Why:** `apad` pads audio to infinite duration. When used with `amix=duration=first`, FFmpeg tries to read the full padded stream before it can determine the first input's duration — this causes a permanent hang with no output.

**How to apply:** Use the `-shortest` flag to stop encoding when the shortest stream (video) ends:
```
ffmpeg -i video.mp4 -i voiceover.mp3 -map 0:v -map 1:a -c:v copy -c:a aac -b:a 192k -ar 48000 -shortest -y final.mp4
```

For BGM mixing:
```
-filter_complex "[2:a]volume=0.08[bgm];[1:a][bgm]amix=inputs=2:duration=shortest[a]"
```
