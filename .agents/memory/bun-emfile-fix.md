---
name: Bun EMFILE fix
description: Bun hits EMFILE when its install cache grows large, crashing Vite
---

**Rule:** When Bun's install cache grows large (many packages installed), running `bunx vite dev` or `bun run dev` fails with EMFILE + `getifaddrs returned an error`.

**Why:** Bun scans its entire install cache on startup. When the cache has many subdirectories (e.g. after installing groq-sdk, @anthropic-ai/sdk, express, pg etc), it opens too many file descriptors and the OS limit is hit. This also exhausts FDs needed by Vite's `getifaddrs` call, crashing the server.

**How to apply:**
1. Clear the cache: `rm -rf .cache/.bun`
2. Run vite via: `bun run dev:frontend` (uses `vite dev` from package.json scripts, which is slightly more isolated than bunx)
3. `ulimit -n 65536` in the workflow shell does NOT reliably help because Bun ignores it
