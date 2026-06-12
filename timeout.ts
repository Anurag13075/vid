import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { generateScript } from "./scriptGenerator.js";
import { generateVoiceover } from "./voiceover.js";
import { findMultipleFootage, downloadClip, createClipTracker } from "./footageAgent.js";
import { assemble, RENDER_STEPS } from "./assembler.js";
import { updateVideo, getVideo } from "../db.js";
import { withDeadline } from "./timeout.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { jobQueue } from "./queue.js";
import type { ScriptSection, Clip, SseEvent, Stage } from "./types.js";

// ── Total pipeline deadline: 25 minutes ──────────────────────────────────────
const PIPELINE_TIMEOUT_MS = 25 * 60 * 1000;

// Process sections in small batches to avoid OOM on Railway free tier
const BATCH_SIZE = 2;

async function emit(videoId: string, event: SseEvent) {
  jobQueue.emit(videoId, event);
  await updateVideo(videoId, {
    stage: event.stage,
    progress: event.progress,
    message: event.message,
    ...(event.script       ? { script: JSON.stringify(event.script) }             : {}),
    ...(event.clips        ? { clips: JSON.stringify(event.clips) }               : {}),
    ...(event.renderSteps  ? { render_steps: JSON.stringify(event.renderSteps) }  : {}),
    ...(event.renderProgress !== undefined ? { render_progress: event.renderProgress } : {}),
    ...(event.videoUrl     ? { video_url: event.videoUrl }                        : {}),
    ...(event.thumbnailUrl ? { thumbnail_url: event.thumbnailUrl }                : {}),
    ...(event.errorMessage ? { error_message: event.errorMessage }                : {}),
  });
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3): Promise<T> {
  const delays = [5000, 15000, 45000];
  let lastErr: Error | null = null;
  for (let i = 0; i < retries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err as Error;
      console.error(`Attempt ${i + 1} failed:`, err);
      if (i < retries - 1) await new Promise((r) => setTimeout(r, delays[i]));
    }
  }
  throw lastErr;
}

export function startPipeline(videoId: string) {
  jobQueue.enqueue(videoId, () => runPipeline(videoId));
}

async function runPipeline(videoId: string) {
  const video = await getVideo(videoId);
  if (!video) return;

  const { title, voice, length } = video;

  // Wrap the entire pipeline in a hard deadline so it can never hang forever
  const pipelineWork = doPipeline(videoId, title, voice, length);

  const timedOut = await withDeadline(
    pipelineWork.then(() => false).catch(async (err) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Pipeline error for ${videoId}:`, err);
      await emit(videoId, {
        stage: "error" as Stage,
        progress: 0,
        message: `Pipeline failed: ${msg}`,
        errorMessage: msg,
      });
      return false;
    }),
    PIPELINE_TIMEOUT_MS,
    true,
    `pipeline ${videoId}`
  );

  if (timedOut) {
    console.error(`Pipeline ${videoId} hit global ${PIPELINE_TIMEOUT_MS}ms deadline`);
    await emit(videoId, {
      stage: "error" as Stage,
      progress: 0,
      message: "Pipeline timed out after 25 minutes",
      errorMessage: "Global pipeline timeout",
    });
  }
}

async function doPipeline(
  videoId: string,
  title: string,
  voice: string,
  length: string
): Promise<void> {
  // ── Phase 1: Script ────────────────────────────────────────────────────────
  await emit(videoId, {
    stage: "researching" as Stage,
    progress: 5,
    message: "Analyzing topic and researching angles...",
  });

  await new Promise((r) => setTimeout(r, 1500));

  await emit(videoId, {
    stage: "writing" as Stage,
    progress: 15,
    message: "Generating script with Claude AI...",
  });

  const script = await withRetry(() => generateScript(title, length));

  await emit(videoId, {
    stage: "writing" as Stage,
    progress: 30,
    message: `Script ready — ${script.sections.length} sections`,
    script,
  });

  // ── Phase 2: Voiceover ─────────────────────────────────────────────────────
  await emit(videoId, {
    stage: "voiceover" as Stage,
    progress: 32,
    message: "Generating voiceover...",
    script,
  });

  const audioPaths: (string | null)[] = [];

  for (let i = 0; i < script.sections.length; i++) {
    const section = script.sections[i];
    const pct = 32 + Math.round((i / script.sections.length) * 18);

    // Skip graphic sections — they have no narration
    if (!section.narration.trim() || section.section_type === "graphic") {
      audioPaths.push(null);
      continue;
    }

    try {
      const { audioPath } = await withDeadline(
        generateVoiceover(section, videoId, voice),
        30_000,
        { audioPath: null as unknown as string },
        `voiceover section ${section.id}`
      );
      audioPaths.push(audioPath || null);
      await emit(videoId, {
        stage: "voiceover" as Stage,
        progress: pct,
        message: `Voiceover ${i + 1}/${script.sections.length} done`,
        script,
      });
    } catch (err) {
      console.error(`Voiceover failed for section ${section.id}:`, err);
      audioPaths.push(null);
    }
  }

  // ── Phase 3: Footage ───────────────────────────────────────────────────────
  const usedIds = createClipTracker();

  // Pre-init clip list — graphic/empty sections are immediately skipped
  const clips: Clip[] = script.sections.map((s) => ({
    id: s.id,
    keyword: s.visual_keywords?.[0] || "cinematic background",
    thumbUrl: "",
    videoUrl: "",
    source: "pexels" as const,
    externalId: "",
    duration: 10,
    status: (s.section_type === "graphic" || !s.narration.trim())
      ? ("skipped" as const)
      : ("pending" as const),
  }));

  await emit(videoId, {
    stage: "footage" as Stage,
    progress: 50,
    message: "Searching for matching footage...",
    script,
    clips,
  });

  const footagePathsPerSection: (string[] | null)[] = new Array(script.sections.length).fill(null);

  for (let batchStart = 0; batchStart < script.sections.length; batchStart += BATCH_SIZE) {
    const batchEnd = Math.min(batchStart + BATCH_SIZE, script.sections.length);
    const batchIndices = Array.from({ length: batchEnd - batchStart }, (_, k) => batchStart + k);

    await Promise.all(
      batchIndices.map(async (i) => {
        const section = script.sections[i];

        // Skip graphic sections and sections with no audio
        if (
          section.section_type === "graphic" ||
          !section.narration.trim() ||
          !audioPaths[i]
        ) {
          footagePathsPerSection[i] = null;
          return;
        }

        clips[i] = { ...clips[i], status: "downloading" };

        // Hard 35s cap per section covering search + all downloads combined
        await withDeadline(
          (async () => {
            try {
              const foundClips = await findMultipleFootage(section, 3, videoId, usedIds);

              if (foundClips.length === 0) {
                console.warn(`Section ${section.id}: no clips found, will use black fallback`);
                clips[i] = { ...clips[i], status: "failed" };
                return;
              }

              // Download clips — returns null on failure, never throws
              const downloadedPaths = (
                await Promise.all(
                  foundClips.map((clip, ci) =>
                    downloadClip(clip, videoId, `${section.id}_${ci}`)
                  )
                )
              ).filter((p): p is string => p !== null);

              if (downloadedPaths.length > 0) {
                clips[i] = {
                  ...foundClips[0],
                  localPath: downloadedPaths[0],
                  status: "ready",
                };
                footagePathsPerSection[i] = downloadedPaths;
              } else {
                console.warn(`Section ${section.id}: all downloads failed, using black fallback`);
                clips[i] = { ...clips[i], status: "failed" };
              }
            } catch (err) {
              console.error(`Section ${section.id} footage error:`, err);
              clips[i] = { ...clips[i], status: "failed" };
            }
          })(),
          35_000,
          undefined,
          `footage+download section ${section.id}`
        );
      })
    );

    // Emit progress after each batch
    const readyCount    = clips.filter((c) => c.status === "ready").length;
    const searchable    = clips.filter((c) => c.status !== "skipped").length;
    const pct           = 50 + Math.round((batchEnd / script.sections.length) * 18);

    await emit(videoId, {
      stage: "footage" as Stage,
      progress: pct,
      message: `${readyCount}/${searchable} clips ready`,
      script,
      clips: [...clips],
    });
  }

  // ── Phase 4: Assembly ──────────────────────────────────────────────────────
  const renderSteps = RENDER_STEPS.map((s) => ({ ...s }));

  await emit(videoId, {
    stage: "rendering" as Stage,
    progress: 68,
    message: "Starting FFmpeg render pipeline...",
    script,
    clips,
    renderSteps,
    renderProgress: 0,
  });

  const outputDir = path.join(__dirname, "..", "..", "data", "videos", videoId);
  await fs.mkdir(outputDir, { recursive: true });

  const bgmPath = await findBgm(script.mood || "neutral");

  const { videoPath, thumbPath } = await assemble(
    videoId,
    title,
    script.sections,
    audioPaths,
    footagePathsPerSection,
    bgmPath,
    outputDir,
    async (step, total, label) => {
      const updatedSteps = renderSteps.map((s, idx) => ({
        ...s,
        done: idx < step,
      }));
      if (step < renderSteps.length) updatedSteps[step].done = false;

      const renderPct  = Math.round((step / total) * 100);
      const overallPct = 68 + Math.round((step / total) * 28);

      await emit(videoId, {
        stage: "rendering" as Stage,
        progress: overallPct,
        message: label,
        script,
        clips,
        renderSteps: updatedSteps,
        renderProgress: renderPct,
      });
    }
  );

  // ── Phase 5: Done ──────────────────────────────────────────────────────────
  const videoUrl     = `/videos/${videoId}/final.mp4`;
  const thumbnailUrl = `/videos/${videoId}/thumb.jpg`;

  await emit(videoId, {
    stage: "done" as Stage,
    progress: 100,
    message: "Video ready — upload to YouTube!",
    script,
    clips,
    renderSteps: RENDER_STEPS.map((s) => ({ ...s, done: true })),
    renderProgress: 100,
    videoUrl,
    thumbnailUrl,
  });

  console.log(`✅ Video ${videoId} complete: ${videoPath}`);

  // Clean up temp files
  fs.rm(path.join("/tmp/vidrush", videoId), { recursive: true, force: true }).catch(() => {});
}

async function findBgm(mood: string): Promise<string | null> {
  const moodDir     = path.join(__dirname, "..", "assets", "music", mood);
  const fallbackDir = path.join(__dirname, "..", "assets", "music", "neutral");

  for (const dir of [moodDir, fallbackDir]) {
    try {
      const files = await fs.readdir(dir);
      const mp3s  = files.filter((f) => f.endsWith(".mp3"));
      if (mp3s.length > 0) {
        const pick = mp3s[Math.floor(Math.random() * mp3s.length)];
        return path.join(dir, pick);
      }
    } catch {
      // directory doesn't exist — try next
    }
  }
  return null;
}
