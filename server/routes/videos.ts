import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import { createVideo, getVideo, listVideos, updateVideo } from "../db.js";
import { startPipeline } from "../pipeline/orchestrator.js";
import { VOICES } from "../pipeline/voiceover.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/voices — must be before /:id
router.get("/voices", (_req: Request, res: Response) => {
  res.json(VOICES);
});

// POST /api/videos — create and kick off pipeline
router.post("/", async (req: Request, res: Response) => {
  try {
    const { title, voice, length, theme, background, mode } = req.body;

    if (!title || typeof title !== "string" || !title.trim()) {
      return res.status(400).json({ error: "title is required" });
    }

    const validVoiceIds = VOICES.map((v) => v.id);
    const validVoice = validVoiceIds.includes(voice) ? voice : "presenter_female";
    const validLength = ["short", "medium", "long"].includes(length) ? length : "medium";
    const validTheme = ["crime", "history", "modern", "minimalist", "standard"].includes(theme) ? theme : "modern";
    const validBackground = typeof background === "string" && background ? background : "gradient_dark";
    const validMode = ["auto", "manual"].includes(mode) ? mode : "auto";

    const id = uuidv4();
    await createVideo({
      id,
      title: title.trim(),
      voice: validVoice,
      length: validLength,
      theme: validTheme,
      background: validBackground,
      mode: validMode,
    });
    startPipeline(id);

    res.json({ id, title: title.trim(), voice: validVoice, length: validLength, theme: validTheme, background: validBackground, mode: validMode });
  } catch (err) {
    console.error("POST /api/videos error:", err);
    res.status(500).json({ error: "Failed to create video" });
  }
});

// GET /api/videos — list videos
router.get("/", async (_req: Request, res: Response) => {
  try {
    const videos = await listVideos();
    res.json(videos);
  } catch (err) {
    res.status(500).json({ error: "Failed to list videos" });
  }
});

// GET /api/videos/:id — get video status (must come after static routes)
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const video = await getVideo(req.params.id as string);
    if (!video) return res.status(404).json({ error: "Not found" });

    const normalized = {
      id: video.id,
      title: video.title,
      voice: video.voice,
      length: video.length,
      theme: video.theme || "modern",
      background: video.background || "gradient_dark",
      mode: video.mode || "auto",
      stage: video.stage,
      progress: video.progress,
      message: video.message,
      script: typeof video.script === "string" ? JSON.parse(video.script) : video.script,
      clips: typeof video.clips === "string" ? JSON.parse(video.clips) : video.clips,
      renderSteps:
        typeof video.render_steps === "string"
          ? JSON.parse(video.render_steps)
          : video.render_steps,
      renderProgress: video.render_progress,
      videoUrl: video.video_url,
      thumbnailUrl: video.thumbnail_url,
      durationSeconds: video.duration_seconds,
      errorMessage: video.error_message,
      createdAt: video.created_at,
    };

    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Failed to get video" });
  }
});

// DELETE /api/videos/:id
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    await updateVideo(req.params.id as string, { stage: "error", message: "Deleted" });
    res.json({ ok: true });
  } catch {
    res.status(500).json({ error: "Failed to delete video" });
  }
});

export default router;
