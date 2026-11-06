import { Router, type Request, type Response } from "express";
import { v4 as uuidv4 } from "uuid";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { createVideo, getVideo, listVideos, updateVideo } from "../db.js";
import { startPipeline, startIncrementalReRender, cancelVideoJob } from "../pipeline/orchestrator.js";
import { VOICES } from "../pipeline/voiceover.js";
import { interpretVoiceCommand } from "../pipeline/commandInterpreter.js";
import { jobQueue } from "../pipeline/queue.js";
import { ffmpeg, getExactDuration } from "../pipeline/ffmpeg.js";

const router: ReturnType<typeof Router> = Router();

// GET /api/videos/voices
router.get("/voices", (_req: Request, res: Response) => {
  res.json(VOICES);
});

// POST /api/videos/command — Interpret voice dictation & optionally execute
router.post("/command", async (req: Request, res: Response) => {
  try {
    const { command, videoId, execute } = req.body;
    if (!command || typeof command !== "string" || !command.trim()) {
      return res.status(400).json({ error: "Voice command string is required" });
    }

    // Load project state from DB if videoId is provided
    let projectState: any = null;
    if (videoId) {
      const raw = await getVideo(videoId);
      if (raw) {
        projectState = {
          id: raw.id,
          title: raw.title,
          voice: raw.voice,
          length: raw.length,
          theme: raw.theme,
          script: typeof raw.script === "string" ? JSON.parse(raw.script) : raw.script,
          clips: typeof raw.clips === "string" ? JSON.parse(raw.clips) : raw.clips,
        };
      }
    }

    // Call Groq AI with Zod command interpretation schema
    const interpretation = await interpretVoiceCommand(command.trim(), projectState);

    // If execute flag is requested, apply the actions immediately
    let executionResult: any = { executed: false };
    if (execute) {
      for (const action of interpretation.actions) {
        if (action.type === "create_video") {
          const newId = uuidv4();
          await createVideo({
            id: newId,
            title: action.topic,
            voice: action.voice || "presenter_female",
            length: action.length || "short",
            theme: action.theme || "modern",
            mode: "auto",
          });
          startPipeline(newId);
          executionResult = { executed: true, newVideoId: newId };
          break;
        }

        if (action.type === "change_voice" && videoId) {
          await updateVideo(videoId, { voice: action.voice });
          startIncrementalReRender(videoId, { newVoice: action.voice });
          executionResult = { executed: true, modified: "voice", videoId };
        }

        if (action.type === "set_theme" && videoId) {
          await updateVideo(videoId, { theme: action.theme });
          startIncrementalReRender(videoId, { newTheme: action.theme });
          executionResult = { executed: true, modified: "theme", videoId };
        }

        if (action.type === "replace_footage" && videoId) {
          startIncrementalReRender(videoId, {
            affectedScenes: [action.scene_index],
            rewriteInstructions: [{ sceneIndex: action.scene_index, newKeywords: action.new_keywords }],
          });
          executionResult = { executed: true, modified: "footage", scene: action.scene_index, videoId };
        }

        if (action.type === "rewrite_scene" && videoId) {
          startIncrementalReRender(videoId, {
            affectedScenes: [action.scene_index],
            rewriteInstructions: [{ sceneIndex: action.scene_index, newNarration: action.instruction }],
          });
          executionResult = { executed: true, modified: "scene_rewrite", scene: action.scene_index, videoId };
        }
      }
    }

    res.json({
      interpretation,
      execution: executionResult,
    });
  } catch (err: any) {
    console.error("Voice command processing error:", err);
    res.status(500).json({ error: err.message || "Failed to process voice command" });
  }
});

// POST /api/videos/transcribe — Wispr Flow & Groq Whisper fallback audio transcription
router.post("/transcribe", async (req: Request, res: Response) => {
  try {
    const { audioBase64, language, wisprApiKey, mimeType } = req.body;
    if (!audioBase64) {
      return res.status(400).json({ error: "audioBase64 is required" });
    }

    const wisprKey = (wisprApiKey || process.env.WISPR_FLOW_API_KEY || "").trim();
    // 1. Try Wispr Flow Voice Interface API if key is available
    if (wisprKey) {
      try {
        const wisprRes = await fetch("https://platform-api.wisprflow.ai/api/v1/dash/api", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${wisprKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            audio: audioBase64,
            language: language ? [language] : ["en"],
            context: { app: { name: "VidRush", type: "ai" } },
          }),
        });

        if (wisprRes.ok) {
          const data = (await wisprRes.json()) as any;
          const text = data.text || data.transcription || "";
          return res.json({ text, provider: "wispr-flow" });
        }
      } catch (e: any) {
        console.warn("Wispr Flow transcription failed, trying Whisper fallback:", e.message);
      }
    }

    // 2. Groq Whisper (ultra low-latency fallback using Groq cloud)
    const groqKey = (process.env.GROQ_API_KEY || process.env.GROK_API_KEY || "").trim();
    if (groqKey) {
      const buffer = Buffer.from(audioBase64, "base64");
      const mime = mimeType || "audio/webm";
      const ext = mime.includes("mp4") || mime.includes("m4a") ? "m4a" : mime.includes("wav") ? "wav" : "webm";
      const blob = new Blob([buffer], { type: mime });
      const formData = new FormData();
      formData.append("file", blob, `speech.${ext}`);
      formData.append("model", "whisper-large-v3-turbo");

      const groqWhisperRes = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
        method: "POST",
        headers: { Authorization: `Bearer ${groqKey}` },
        body: formData,
      });

      if (groqWhisperRes.ok) {
        const groqData = (await groqWhisperRes.json()) as any;
        return res.json({ text: groqData.text || "", provider: "groq-whisper" });
      }
    }

    res.status(500).json({ error: "No transcription provider available" });
  } catch (err: any) {
    res.status(500).json({ error: err.message || "Failed to transcribe audio" });
  }
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

// GET /api/videos/:id — get video status
router.get("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;

    const video = await getVideo(id);
    if (!video) return res.status(404).json({ error: "Not found" });

    if (
      (video.stage === "queued" || video.stage === "researching") &&
      !jobQueue.isJobQueued(id) &&
      !jobQueue.isJobRunning(id)
    ) {
      console.log(`[api] Auto-recovering orphaned job ${id} in stage "${video.stage}"`);
      startPipeline(id);
    }

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
      shortVideoUrl: video.short_video_url,
      durationSeconds: video.duration_seconds,
      errorMessage: video.error_message,
      createdAt: video.created_at,
    };

    res.json(normalized);
  } catch (err) {
    res.status(500).json({ error: "Failed to get video" });
  }
});

// In-flight compression locks to prevent duplicate simultaneous FFmpeg tasks
const compressionLocks = new Map<string, Promise<string>>();

async function getOrGenerateCompressedVideo(dir: string, finalMp4Path: string, videoId: string): Promise<string> {
  const compressedPath = path.join(dir, "compressed.mp4");

  if (fs.existsSync(compressedPath)) {
    try {
      const stat = await fs.promises.stat(compressedPath);
      if (stat.size > 500 * 1024) {
        return compressedPath;
      }
    } catch {}
  }

  if (compressionLocks.has(videoId)) {
    return compressionLocks.get(videoId)!;
  }

  const compressPromise = (async () => {
    try {
      console.log(`[compress] Starting data-saver compression for video ${videoId} (target <50MB)... `);
      let dur = 300;
      try {
        const measured = await getExactDuration(finalMp4Path);
        if (measured > 0) dur = measured;
      } catch {}

      // Target size: 42 MB (352,321,536 bits budget)
      const targetTotalBps = (42 * 1024 * 1024 * 8) / Math.max(dur, 20);
      const audioKbps = 96;
      const videoKbps = Math.min(1800, Math.max(220, Math.floor((targetTotalBps - audioKbps * 1000) / 1000)));

      const tmpOut = path.join(dir, `compressed_${Date.now()}.mp4`);
      await ffmpeg([
        "-i", finalMp4Path,
        "-vf", "scale=-2:720",
        "-c:v", "libx264",
        "-b:v", `${videoKbps}k`,
        "-maxrate", `${Math.floor(videoKbps * 1.35)}k`,
        "-bufsize", `${Math.floor(videoKbps * 2)}k`,
        "-preset", "veryfast",
        "-threads", "2",
        "-c:a", "aac",
        "-b:a", `${audioKbps}k`,
        "-ar", "44100",
        "-movflags", "+faststart",
        "-y", tmpOut,
      ]);

      await fs.promises.rename(tmpOut, compressedPath);
      console.log(`[compress] Compressed video ready for ${videoId} at ${compressedPath}`);
      return compressedPath;
    } finally {
      compressionLocks.delete(videoId);
    }
  })();

  compressionLocks.set(videoId, compressPromise);
  return compressPromise;
}

// GET /api/videos/:id/compress-status — Check or trigger data-saver compression
router.get("/:id/compress-status", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const candidateDirs = [
      path.join(process.cwd(), "data", "videos", id),
      path.resolve("data", "videos", id),
    ];

    let foundDir: string | null = null;
    let compressedPath: string | null = null;
    for (const d of candidateDirs) {
      if (fs.existsSync(path.join(d, "final.mp4"))) {
        foundDir = d;
        const comp = path.join(d, "compressed.mp4");
        if (fs.existsSync(comp)) compressedPath = comp;
        break;
      }
    }

    if (!foundDir) {
      return res.status(404).json({ error: "Master video not found" });
    }

    if (compressedPath) {
      try {
        const stat = await fs.promises.stat(compressedPath);
        if (stat.size > 500 * 1024) {
          return res.json({
            ready: true,
            sizeMb: Number((stat.size / (1024 * 1024)).toFixed(1)),
            url: `/api/videos/${id}/download`,
          });
        }
      } catch {}
    }

    const isCompressing = compressionLocks.has(id);
    if (!isCompressing && req.query.trigger === "1") {
      const finalMp4 = path.join(foundDir, "final.mp4");
      getOrGenerateCompressedVideo(foundDir, finalMp4, id).catch((err) => {
        console.error(`[compress] Background trigger failed: ${err.message}`);
      });
      return res.json({ ready: false, compressing: true });
    }

    res.json({ ready: false, compressing: isCompressing });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});

// GET /api/videos/:id/download — Native high-speed attachment download
// Supports ?master=1 for original 1-2GB master, or default data-saver (<50MB)
router.get("/:id/download", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const isMaster = req.query.master === "1" || req.query.quality === "master" || req.query.full === "1";
    const candidateDirs = [
      path.join(process.cwd(), "data", "videos", id),
      path.resolve("data", "videos", id),
    ];

    let targetFile: string | null = null;
    let foundDir: string | null = null;
    for (const d of candidateDirs) {
      const f = path.join(d, "final.mp4");
      if (fs.existsSync(f)) {
        targetFile = f;
        foundDir = d;
        break;
      }
    }

    if (!targetFile || !foundDir) {
      return res.status(404).json({ error: "Video file not found or still rendering" });
    }

    const video = await getVideo(id);
    const rawTitle = video?.title || "VidRush-Video";
    const cleanTitle = rawTitle.replace(/[^a-zA-Z0-9_-]/g, "_").slice(0, 80);

    if (isMaster) {
      const downloadName = `${cleanTitle}_1080p_Master.mp4`;
      return res.download(path.resolve(targetFile), downloadName);
    }

    let sendFile = targetFile;
    let downloadName = `${cleanTitle}_DataSaver.mp4`;

    try {
      const compressedFile = await getOrGenerateCompressedVideo(foundDir, targetFile, id);
      const stat = await fs.promises.stat(compressedFile);
      const sizeMb = (stat.size / (1024 * 1024)).toFixed(1);
      sendFile = compressedFile;
      downloadName = `${cleanTitle}_${sizeMb}MB.mp4`;
    } catch (compressErr: any) {
      console.warn(`[download] Compression failed, falling back to original: ${compressErr.message}`);
    }

    res.download(path.resolve(sendFile), downloadName);
  } catch (err: any) {
    res.status(500).json({ error: "Download failed: " + err.message });
  }
});

// POST /api/videos/:id/cancel — Explicit endpoint to cancel a video generation immediately
router.post("/:id/cancel", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const cancelled = await cancelVideoJob(id);
    res.json({ ok: true, cancelled });
  } catch (err: any) {
    console.error("Cancel video error:", err);
    res.status(500).json({ error: err.message || "Failed to cancel video" });
  }
});

// DELETE /api/videos/:id — Stop running processes, clean temp files, mark cancelled
router.delete("/:id", async (req: Request, res: Response) => {
  try {
    const id = req.params.id as string;
    const cancelled = await cancelVideoJob(id);
    res.json({ ok: true, cancelled });
  } catch (err: any) {
    console.error("Delete/cancel video error:", err);
    res.status(500).json({ error: "Failed to delete/cancel video" });
  }
});

export default router;
