---
name: VidRush stack
description: Pipeline components and API integrations used in VidRush video generation
---

## Current stack (as of June 2026)

- **Script generation**: Claude (claude-3-5-haiku-20241022) via `@anthropic-ai/sdk` — `ANTHROPIC_API_KEY` in Replit Secrets
- **Voice over**: MiniMax TTS (`speech-02-hd` model) via REST API — `MINIMAX_API_KEY` + `MINIMAX_GROUP_ID` in Replit Secrets; endpoint `https://api.minimaxi.chat/v1/t2a_v2?GroupId=<ID>`; returns hex-encoded audio in `data.audio`; decode with `Buffer.from(hex, "hex")`
- **Footage**: Pexels + Pixabay — `PEXELS_API_KEY` + `PIXABAY_API_KEY` in `.env`
- **Assembly**: FFmpeg + ffprobe installed via Nix; use `-shortest` flag (never `apad`)
- **State**: PostgreSQL (Neon) — `DATABASE_URL` in `.env`
- **Frontend**: TanStack Start + Vite on port 5000; Express API on port 3001

## Wizard flow

Landing → `/create?topic=...&length=...&mode=...` → Step 1 Voice → Step 2 Theme → Step 3 Background → POST /api/videos → `/generate/$jobId` → `/result/$jobId`

## MiniMax voice IDs (English)

`presenter_female`, `audiobook_female_1`, `presenter_male`, `audiobook_male_1`, `newscast_male`, `casual_guy`, `wise_woman`, `deep_space_master`, `calm_woman`, `audiobook_female_2`, `audiobook_male_2`, `newscast_female`

## Output

`data/videos/{id}/final.mp4` served as Express static, proxied via Vite `/videos`

**Why:** Replaced Groq + edge-tts with Claude + MiniMax for better quality and reliability.
