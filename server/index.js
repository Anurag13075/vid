import "dotenv/config";
import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { initDb, getVideo } from "./db.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { jobQueue } from "./pipeline/queue.js";
import videosRouter from "./routes/videos.js";
const app = express();
const PORT = process.env.API_PORT || 3001;
app.use(cors({ origin: "*" }));
app.use(express.json({ limit: "10mb" }));
// Serve rendered videos as static files
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
async function main() {
    try {
        await initDb();
        app.listen(PORT, () => {
            console.log(`🚀 VidRush API server running on http://localhost:${PORT}`);
        });
    }
    catch (err) {
        console.error("Failed to start server:", err);
        process.exit(1);
    }
}
main();
