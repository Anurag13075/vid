/**
 * Unified production server — single process, single port (5000).
 * Express handles /api/* and /videos/*; Nitro SSR handles everything else.
 * Run with: tsx server/prod.ts   OR   node --import tsx/esm server/prod.ts
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, getVideo } from "./db.js";
import { jobQueue } from "./pipeline/queue.js";
import videosRouter from "./routes/videos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5000);

// ── Express ────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// Serve generated video files
app.use("/videos", express.static(path.join(__dirname, "../data/videos")));

// REST API
app.use("/api/videos", videosRouter);

// SSE — real-time pipeline progress
app.get("/api/pipeline/:id/status", async (req, res) => {
  const videoId = req.params.id;
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    try { res.write(`data: ${JSON.stringify(data)}\n\n`); } catch {}
  };

  try {
    const video = await getVideo(videoId);
    if (video) {
      send({
        stage: video.stage,
        progress: video.progress,
        message: video.message,
        script: video.script,
        clips: video.clips,
        renderSteps: video.render_steps,
        renderProgress: video.render_progress,
        videoUrl: video.video_url,
      });
    }
  } catch {}

  const unsub = jobQueue.subscribe(videoId, (event) => {
    send(event);
    if (event.stage === "done" || event.stage === "error") res.end();
  });

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch {}
  }, 15_000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsub();
  });
});

app.get("/api/health", (_req, res) => res.json({ ok: true, ts: Date.now() }));

// ── Nitro SSR handler (all non-API routes) ─────────────────────────────────────
let nitro: { fetch(req: Request, env: unknown, ctx: unknown): Promise<Response> } | null = null;

async function loadNitro() {
  if (nitro) return nitro;
  // Dynamic import so missing dist doesn't crash the require phase
  const mod = await import(
    path.join(__dirname, "../dist/server/server.js") as unknown as string
  );
  nitro = (mod.default ?? mod) as typeof nitro;
  return nitro!;
}

app.all(/.*/, async (req, res) => {
  try {
    const handler = await loadNitro();

    // Build a Web API Request from the Express request
    const proto = (req.headers["x-forwarded-proto"] as string) || "http";
    const host = req.headers.host || `localhost:${PORT}`;
    const url = new URL(req.originalUrl, `${proto}://${host}`);

    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (Array.isArray(v)) v.forEach((val) => headers.append(k, val));
      else if (v) headers.set(k, v);
    }

    const hasBody = req.method !== "GET" && req.method !== "HEAD";
    const body = hasBody
      ? await new Promise<Buffer>((resolve, reject) => {
          const chunks: Buffer[] = [];
          req.on("data", (c) => chunks.push(c));
          req.on("end", () => resolve(Buffer.concat(chunks)));
          req.on("error", reject);
        })
      : undefined;

    const webReq = new Request(url.toString(), {
      method: req.method,
      headers,
      body: body?.length ? body : undefined,
    });

    const webRes = await handler.fetch(webReq, {}, { waitUntil: () => {} });

    res.status(webRes.status);
    webRes.headers.forEach((v, k) => res.setHeader(k, v));
    const buf = Buffer.from(await webRes.arrayBuffer());
    res.end(buf);
  } catch (err) {
    console.error("SSR error:", err);
    res.status(500).send("Internal server error");
  }
});

// ── Boot ───────────────────────────────────────────────────────────────────────
async function main() {
  await initDb();

  // Pre-warm the Nitro handler so the first request isn't slow
  loadNitro().catch((e) =>
    console.warn("⚠️  Could not pre-load SSR bundle:", (e as Error).message)
  );

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VidRush running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
