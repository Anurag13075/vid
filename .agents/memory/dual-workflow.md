---
name: Dual workflow setup for VidRush
description: Vite + Express API must be two separate Replit workflows
---

**Rule:** Run Vite frontend and Express API as two separate Replit workflows, never via `concurrently` in a single workflow.

**Why:** Running `concurrently "vite dev" "bun run server/index.ts"` in a single workflow hits Bun's EMFILE limit (see bun-emfile-fix.md). The `getifaddrs` call then fails and Vite crashes.

**How to apply:**
- Workflow 1 "Start application": `bun run dev:frontend` (port 5000, webview)
- Workflow 2 "API Server": `bun run server/index.ts` (port 3001, console)
- Vite proxies `/api` and `/videos` to `http://localhost:3001` via `vite.config.ts` server.proxy

**edge-tts path:** `/home/runner/workspace/.pythonlibs/bin/edge-tts` — this IS in PATH so `spawn("edge-tts", ...)` works directly.
