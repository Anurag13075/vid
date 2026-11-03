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
import { initDb, getVideo } from "./db.js";
import { jobQueue } from "./pipeline/queue.js";
import { checkFFmpegCapabilities } from "./pipeline/ffmpeg.js";
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

  // On-demand compression to ~55MB if compressed.mp4 is requested
  if (!targetFile && filename === "compressed.mp4" && foundDir) {
    const sourceMp4 = path.join(foundDir, "final.mp4");
    if (fs.existsSync(sourceMp4)) {
      const compOut = path.join(foundDir, "compressed.mp4");
      const partComp = compOut + ".part.mp4";
      try {
        const ffmpegCmd = process.env.FFMPEG_PATH || "ffmpeg";
        spawnSync(ffmpegCmd, [
          "-i", sourceMp4,
          "-c:v", "libx264", "-crf", "26",
          "-b:v", "650k", "-maxrate", "950k", "-bufsize", "1500k",
          "-preset", "ultrafast",
          "-profile:v", "high", "-level", "4.1",
          "-pix_fmt", "yuv420p",
          "-c:a", "aac", "-b:a", "96k", "-ar", "44100",
          "-movflags", "+faststart",
          "-y", partComp,
        ], { timeout: 180000 });
        if (fs.existsSync(partComp) && fs.statSync(partComp).size > 10000) {
          fs.renameSync(partComp, compOut);
          targetFile = compOut;
        }
      } catch (err) {
        console.warn("[compress] On-demand compression failed:", err);
      }
    }
  }

  if (!targetFile) {
    return res.status(404).json({ error: "Video file not found or still rendering" });
  }

  const ext = path.extname(filename).toLowerCase();
  const contentType = ext === ".mp4" ? "video/mp4" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : "application/octet-stream";

  res.sendFile(path.resolve(targetFile), {
    acceptRanges: true,
    headers: {
      "Content-Type": contentType,
      "Accept-Ranges": "bytes",
    },
  });
});

// Serve other static assets in data/videos
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

// ── Boot ───────────────────────────────────────────────────────────────────────
async function main() {
  checkFFmpegCapabilities();
  await initDb();

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`🚀 VidRush running on http://0.0.0.0:${PORT}`);
  });
}

main().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
