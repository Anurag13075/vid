import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { spawnSync } from "child_process";
import { fileURLToPath } from "url";
import { initDb, getVideo } from "./db.js";
import { checkFFmpegCapabilities } from "./pipeline/ffmpeg.js";
const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { jobQueue } from "./pipeline/queue.js";
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
        path.join(__dirname, "../data/videos", videoId),
        path.join(process.cwd(), "data/videos", videoId),
        path.resolve("data", "videos", videoId),
    ];
    let targetFile = null;
    let foundDir = null;
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
app.use("/videos", express.static(path.join(__dirname, "../data/videos")));
// REST endpoints
app.use("/api/videos", videosRouter);
// SSE: real-time pipeline status
app.get("/api/pipeline/:id/status", async (req, res) => {
    const videoId = req.params.id;
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();
    const send = (data) => {
        try {
            res.write(`data: ${JSON.stringify(data)}\n\n`);
        }
        catch { }
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
            });
        }
    }
    catch { }
    const unsub = jobQueue.subscribe(videoId, (event) => {
        send(event);
        if (event.stage === "done" || event.stage === "error") {
            res.end();
        }
    });
    const keepAlive = setInterval(() => {
        try {
            res.write(": ping\n\n");
        }
        catch { }
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
        app.listen(PORT, () => {
            console.log(`🚀 VidRush server running on http://localhost:${PORT} [${IS_PROD ? "production" : "development"}]`);
        });
    }
    catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}
main();
