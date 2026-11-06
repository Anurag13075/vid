/**
 * Unified production server — single process, single port.
 * Express handles /api/* and /videos/*; everything else serves dist/index.html.
 * Run with: tsx server/prod.ts
 */
import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { initDb, getVideo, listVideos } from "./db.js";
import { jobQueue } from "./pipeline/queue.js";
import { checkFFmpegCapabilities } from "./pipeline/ffmpeg.js";
import { getDataDir } from "./pipeline/tempDir.js";
import { startPipeline } from "./pipeline/orchestrator.js";
import videosRouter from "./routes/videos.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 5000);

// ── Express ────────────────────────────────────────────────────────────────────
const app = express();
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// Dedicated video serving with Range support (prevents 404 falling back to index.html)
app.get("/videos/:videoId/:filename", (req, res) => {
  const { videoId, filename } = req.params;
  const candidateDirs = [
    path.join(getDataDir("videos"), videoId),
    path.join(__dirname, "../data/videos", videoId),
    path.join(process.cwd(), "data/videos", videoId),
    path.resolve("data", "videos", videoId),
  ];

  let targetFile: string | null = null;
  let foundDir: string | null = null;
  for (const d of candidateDirs) {
    const f = path.join(d, filename);
    if (fs.existsSync(f)) {
      targetFile = f;
      foundDir = d;
      break;
    } else if (fs.existsSync(d)) {
      foundDir = d;
    }
  }

  // Fall back to final.mp4 if compressed.mp4 was requested
  if (!targetFile && filename === "compressed.mp4" && foundDir) {
    const sourceMp4 = path.join(foundDir, "final.mp4");
    if (fs.existsSync(sourceMp4)) {
      targetFile = sourceMp4;
    }
  }

  if (!targetFile) {
    return res.status(404).json({ error: "Video file not found or still rendering" });
  }

  if (req.query.download === "1" || req.query.download === "true") {
    return res.download(path.resolve(targetFile), filename);
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".mp4" ? "video/mp4" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";

  res.sendFile(path.resolve(targetFile), {
    acceptRanges: true,
    headers: {
      "Content-Type": contentType,
    },
  });
});

// Serve other static assets in data/videos
app.use("/videos", express.static(getDataDir("videos")));

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
        shortVideoUrl: video.short_video_url,
      });

      if (
        (video.stage === "queued" || video.stage === "researching") &&
        !jobQueue.isJobQueued(videoId) &&
        !jobQueue.isJobRunning(videoId)
      ) {
        console.log(`[sse] Auto-recovering orphaned job ${videoId} in stage "${video.stage}"`);
        startPipeline(videoId);
      }
    }
  } catch {}

  const unsub = jobQueue.subscribe(videoId, (event) => {
    send(event);
    if (event.stage === "done" || event.stage === "error") res.end();
  });

  const keepAlive = setInterval(() => {
    try { res.write(": ping\n\n"); } catch {}
  }, 15000);

  req.on("close", () => {
    clearInterval(keepAlive);
    unsub();
  });
});

app.get("/api/health", (_req, res) => {
  res.json({ ok: true, ts: Date.now() });
});

// ── Frontend SPA static serving ───────────────────────────────────────────────
const candidatePaths = [
  path.join(__dirname, "../dist"),
  path.join(__dirname, "../dist/public"),
  path.join(__dirname, "../dist/client"),
  path.join(process.cwd(), "dist"),
  path.join(process.cwd(), "dist/public"),
  path.join(process.cwd(), "dist/client"),
];

function resolveDistPath(): string {
  for (const candidate of candidatePaths) {
    if (fs.existsSync(path.join(candidate, "index.html"))) {
      return candidate;
    }
  }
  return path.join(__dirname, "../dist");
}

const distPath = resolveDistPath();
console.log(`[server] Serving static frontend from: ${distPath}`);

app.use(express.static(distPath));

// Fallback for client-side routing
app.get(/.*/, (req, res) => {
  const activeDist = resolveDistPath();
  const indexPath = path.join(activeDist, "index.html");
  if (fs.existsSync(indexPath)) {
    return res.sendFile(indexPath);
  }
  res.status(404).send("Application frontend build artifact (index.html) not found.");
});

// Start listening immediately so Zerops health check passes in <50ms
app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 VidRush running on http://0.0.0.0:${PORT}`);
});

// ── Boot ───────────────────────────────────────────────────────────────────────
async function main() {
  checkFFmpegCapabilities();
  await initDb();

  const recoverableStages = new Set(["queued", "researching", "writing", "voiceover", "footage", "rendering"]);
  const allVideos = await listVideos();
  const now = Date.now();
  const THIRTY_MINUTES_MS = 30 * 60 * 1000;

  for (const video of allVideos) {
    if (!recoverableStages.has(video.stage)) continue;
    const createdAtMs = new Date(video.created_at || 0).getTime();
    const ageMs = now - createdAtMs;

    // Discard stale jobs older than 30 mins so they never block the queue
    if (ageMs > THIRTY_MINUTES_MS) {
      console.log(`[startup] Expiring stale job ${video.id} (stage: ${video.stage}, age: ${Math.round(ageMs / 60000)}m)`);
      await updateVideo(video.id, {
        stage: "error",
        progress: 0,
        message: "Job expired due to server restart. Please start a fresh generation.",
        error_message: "Stale job expired on container boot",
      }).catch(() => {});
      continue;
    }

    console.log(`[startup] Resuming fresh job ${video.id} from ${video.stage} (age: ${Math.round(ageMs / 60000)}m)`);
    startPipeline(video.id);
  }
}

main().catch((err) => {
  console.error("Initialization warning:", err);
});
