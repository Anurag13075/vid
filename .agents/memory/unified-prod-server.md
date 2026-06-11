---
name: Unified production server
description: How server/prod.ts merges Express API + Nitro SSR into a single process on port 5000
---

The production server (`server/prod.ts`) bridges two handlers into a single Express app:

1. **Express** handles `/api/*`, `/videos/*`, `/api/pipeline/:id/status` (SSE), `/api/health`
2. **Nitro SSR** handles everything else (all frontend routes)

**How the Nitro bridge works:**
- Nitro builds to `dist/server/server.js` and exports a Web Fetch API handler: `{ fetch(req, env, ctx): Promise<Response> }`
- In `server/prod.ts`, all unmatched routes are caught with `app.all(/.*/, ...)` (must use regex, NOT `"*"` string)
- The Express `req` is converted to a Web `Request`, passed to the Nitro handler, and the `Response` is streamed back to the Express `res`

**Why regex route:**
`path-to-regexp` v8 (used by Express 5.x and some Express 4.x installs) rejects `"*"` as a path pattern — use `app.all(/.*/, ...)` instead.

**Start command:** `bun server/prod.ts` (bun runs TypeScript natively; standalone `node`/`tsx` not available on Replit)

**Dev vs prod:**
- Dev: two separate Replit workflows (Vite on 5000, Express on 3001)
- Prod: single `bun server/prod.ts` process on port 5000

**Deployment:**
- Replit Core ($20/mo) — deploy directly with "Publish" button
- Railway / Render — free; `railway.toml` and `render.yaml` already configured
- Static Replit deployment CANNOT work — app requires FFmpeg, Express, PostgreSQL
