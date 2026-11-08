import "dotenv/config";

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { initDb, getVideo, listVideos, updateVideo } from "./db.js";
import { checkFFmpegCapabilities } from "./pipeline/ffmpeg.js";
import { startPipeline } from "./pipeline/orchestrator.js";
import { getDataDir } from "./pipeline/tempDir.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { jobQueue } from "./pipeline/queue.js";
import { VOICES, synthesizeVoicePreview } from "./pipeline/voiceover.js";
import videosRouter from "./routes/videos.js";

const app = express();
const IS_PROD = process.env.NODE_ENV === "production";
const PORT = IS_PROD ? (process.env.PORT || 5000) : (process.env.API_PORT || 3001);

app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));

// Serve rendered videos as static files
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

app.use("/videos", express.static(getDataDir("videos")));

// REST endpoints
app.use("/api/videos", videosRouter);
app.get("/api/voices", (_req, res) => res.json(VOICES));
app.get("/api/voices/preview", async (req, res) => {
  try {
    const voiceId = (req.query.voice as string) || "presenter_male";
    const text = (req.query.text as string) || "Hello, this is a documentary voice preview.";
    const buffer = await synthesizeVoicePreview(voiceId, text);
    res.setHeader("Content-Type", "audio/mpeg");
    res.setHeader("Content-Length", buffer.byteLength);
    res.end(buffer);
  } catch (err: any) {
    res.status(500).json({ error: "Failed to generate preview: " + err.message });
  }
});

// SSE: real-time pipeline status
app.get("/api/pipeline/:id/status", async (req, res) => {
  const videoId = req.params.id;

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");
  res.flushHeaders();

  const send = (data: object) => {
    try {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    } catch {}
  };

  // Send current state immediately
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
    if (event.stage === "done" || event.stage === "error") {
      res.end();
    }
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


// In production, serve the built frontend and let the SPA handle routing
if (IS_PROD) {
  const candidatePaths = [
    path.join(__dirname, "../dist"),
    path.join(__dirname, "../dist/public"),
    path.join(__dirname, "../dist/client"),
    path.join(process.cwd(), "dist"),
    path.join(process.cwd(), "dist/public"),
  ];
  const resolveDist = () => {
    for (const c of candidatePaths) {
      if (fs.existsSync(path.join(c, "index.html"))) return c;
    }
    return path.join(__dirname, "../dist");
  };
  const distPath = resolveDist();
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    const activeDist = resolveDist();
    const indexPath = path.join(activeDist, "index.html");
    if (fs.existsSync(indexPath)) {
      return res.sendFile(indexPath);
    }
    res.status(404).send("Application frontend build artifact (index.html) not found.");
  });
}

async function main() {
  try {
    checkFFmpegCapabilities();
    await initDb();
    const recoverableStages = new Set(["queued", "researching", "writing", "voiceover", "footage", "rendering"]);
    const recoverableVideos = (await listVideos()).filter((video) => recoverableStages.has(video.stage));
    for (const video of recoverableVideos) {
      // A job that has been queued across a restart has no active worker left.
      // Do not let old abandoned rows block every new job in the single-worker queue.
      const ageMs = Date.now() - new Date(video.updated_at || video.created_at).getTime();
      if (video.stage === "queued" && ageMs > 30 * 60 * 1000) {
        await updateVideo(video.id, {
          stage: "error",
          progress: 0,
          message: "This job expired while waiting for a processing worker. Please start a new video.",
          error_message: "Queued job expired after 30 minutes without starting.",
        });
        console.warn(`[startup] Expired stale queued job ${video.id}`);
        continue;
      }
      console.log(`[startup] Resuming interrupted VidRush job ${video.id} from ${video.stage}`);
      startPipeline(video.id);
    }
    app.listen(PORT, () => {
      console.log(`🚀 VidRush server running on http://localhost:${PORT} [${IS_PROD ? "production" : "development"}]`);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
    process.exit(1);
  }
}

main();
