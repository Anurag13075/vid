/**
 * Unified production server — single process, single port.
 * Express handles /api/* and /videos/*; everything else serves dist/index.html.
 * Run with: tsx server/prod.ts
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

// ── Static Files (dist) ────────────────────────────────────────────────────────
const distPath = path.join(__dirname, "../dist");
app.use(express.static(distPath));

// Fallback to index.html for React Router
app.get(/.*/, (req, res) => {
  res.sendFile(path.join(distPath, "index.html"));
});

// ── Boot ───────────────────────────────────────────────────────────────────────
async function main() {
  await initDb();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VidRush running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
