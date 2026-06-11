# VidRush — AI Faceless YouTube Video Platform

Turns a topic prompt into a fully-edited, YouTube-ready MP4 — script, voiceover, stock footage, cuts, and all — with no camera or editor required.

## Stack
- **Frontend**: TanStack Start (React SSR) + Tailwind + shadcn/ui
- **Backend**: Express API + Nitro SSR handler (unified in production)
- **Pipeline**: Anthropic Claude (script) → MiniMax TTS (voiceover) → Pexels/Pixabay (footage) → FFmpeg (assembly)
- **Database**: PostgreSQL (Replit built-in)
- **Runtime**: Bun

## Development (in Replit)
Two workflows run in parallel:
| Workflow | Command | Port |
|---|---|---|
| Start application | `bun x vite --host 0.0.0.0 --port 5000` | 5000 (webview) |
| API Server | `bun run server/index.ts` | 3001 |

Vite proxies `/api/*` and `/videos/*` to the Express server automatically.

## Production Build & Start
```bash
bun run build         # builds dist/client + dist/server
bun server/prod.ts    # single process, single port 5000
```

`server/prod.ts` is the **unified production server**: Express handles all `/api/*` routes; the Nitro SSR bundle handles all frontend routes. No `concurrently`, no two processes.

## Deployment Options

### Option 1 — Replit Core (deploy from here, $20/mo)
Click **Publish** in Replit. The `.replit` deployment config is already set:
- Build: `bun install && bun run build`
- Run: `bun server/prod.ts`

### Option 2 — Railway (free, ~10 min setup)
1. Push to GitHub via Replit's **Git** tab
2. Go to [railway.app](https://railway.app) → New Project → Deploy from GitHub
3. Add a PostgreSQL plugin in the Railway dashboard
4. Set environment variables (see below)
5. Railway auto-deploys on every push — `railway.toml` is already configured

### Option 3 — Render (free)
1. Push to GitHub
2. Go to [render.com](https://render.com) → New → Blueprint
3. Point at your repo — `render.yaml` is already configured (web service + PostgreSQL)
4. Set environment variables

### Required environment variables (all platforms)
```
DATABASE_URL        — PostgreSQL connection string (auto-set by Railway/Render add-ons)
ANTHROPIC_API_KEY   — Claude script generation
MINIMAX_API_KEY     — TTS voiceover
MINIMAX_GROUP_ID    — MiniMax group ID
PEXELS_API_KEY      — Stock footage
PIXABAY_API_KEY     — Stock footage (fallback)
NODE_ENV=production
```

## Video Pipeline
1. **Script** — Claude 3 Haiku writes a ~10-min script split into ~25 sections
2. **Voiceover** — MiniMax TTS renders each section to MP3
3. **Footage** — 3 diverse Pexels/Pixabay clips per section (9 clips total, ~3s each)
4. **Assembly** — FFmpeg cuts every 3.5 s, dissolve transitions, stat overlays
5. **Output** — H.264 1920×1080 MP4, ~80-120 MB

## User preferences
- Keep multi-cut video pacing (one cut every ~3.5 s) — no Ken Burns / zoompan
- No text cards for stat sections — use footage + overlay instead
- Single unified production server (`server/prod.ts`) — no concurrently in prod
