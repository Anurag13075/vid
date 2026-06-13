import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { generateScript } from "./scriptGenerator.js";
import { generateVoiceover } from "./voiceover.js";
import { createClipTracker,    findMultipleFootage  ,downloadClip} from "./footageAgent.js";

import { assemble, RENDER_STEPS } from "./assembler.js";
import { updateVideo, getVideo } from "../db.js";


const __dirname = path.dirname(fileURLToPath(import.meta.url));
import { jobQueue } from "./queue.js";
import type { ScriptSection, Clip, SseEvent, Stage } from "./types.js";

async function emit(videoId: string, event: SseEvent) {
  jobQueue.emit(videoId, event);
  await updateVideo(videoId, {
    stage: event.stage,
    progress: event.progress,
    message: event.message,
    ...(event.script ? { script: JSON.stringify(event.script) } : {}),
    ...(event.clips ? { clips: JSON.stringify(event.clips) } : {}),
    ...(event.renderSteps ? { render_steps: JSON.stringify(event.renderSteps) } : {}),
    ...(event.renderProgress !== undefined ? { render_progress: event.renderProgress } : {}),
    ...(event.videoUrl ? { video_url: event.videoUrl } : {}),
    ...(event.thumbnailUrl ? { thumbnail_url: event.thumbnailUrl } : {}),
    ...(event.errorMessage ? { error_message: event.errorMessage } : {}),
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
      if (i < retries - 1) {
        await new Promise((r) => setTimeout(r, delays[i]));
      }
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

  // Clean up any leftover temp dirs from previous runs to keep /tmp lean
  const vidrushTmp = path.join("/tmp/vidrush");
  try {
    const existing = await fs.readdir(vidrushTmp).catch(() => []);
    for (const dir of existing) {
      if (dir !== videoId) {
        fs.rm(path.join(vidrushTmp, dir), { recursive: true, force: true }).catch(() => {});
      }
    }
  } catch {}

  try {
    // ── Phase 1: Script generation ──────────────────────────────────────
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

    // ── Phase 2: Voiceover ──────────────────────────────────────────────
    await emit(videoId, {
      stage: "voiceover" as Stage,
      progress: 32,
      message: `Generating voiceover with MiniMax TTS...`,
      script,
    });

    const audioPaths: (string | null)[] = [];
    const audioMap = new Map<number, string>();

    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      const pct = 32 + Math.round((i / script.sections.length) * 18);

      if (!section.narration.trim() && section.section_type !== "graphic") {
        audioPaths.push(null);
        continue;
      }

      try {
        const { audioPath } = await generateVoiceover(section, videoId, voice);
        audioPaths.push(audioPath);
        audioMap.set(section.id, audioPath);

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

    // ── Phase 3: Footage search ─────────────────────────────────────────
    // FIX: create a per-job usedIds tracker instead of calling resetUsedClips()
    // (module-level state leaked across concurrent jobs in the old design)
    const usedIds = createClipTracker();

    // Pre-initialize: graphic/empty sections are skipped immediately
    const clips: Clip[] = script.sections.map((s) => ({
      id: s.id,
      keyword: s.visual_keywords[0] || "cinematic background", // first keyword only
      thumbUrl: "",
      videoUrl: "",
      source: "pexels" as const,
      externalId: "",
      duration: 10,
      status: (s.section_type === "graphic" || !s.narration.trim())
        ? "skipped" as const
        : "pending" as const,
    }));

    await emit(videoId, {
      stage: "footage" as Stage,
      progress: 50,
      message: "Searching for matching footage...",
      script,
      clips,
    });

    // Pre-initialize results array
    const footagePathsPerSection: (string[] | null)[] = new Array(script.sections.length).fill(null);

    // Hard cap per section: search (~10s) + 1 SD download (~20s max) = ~30s
    const SECTION_HARD_CAP_MS = 35_000;

    // Process in parallel batches of 2 to limit concurrent network pressure
    const BATCH_SIZE = 2;

    for (let batchStart = 0; batchStart < script.sections.length; batchStart += BATCH_SIZE) {
      const batchEnd = Math.min(batchStart + BATCH_SIZE, script.sections.length);
      const batchIndices = Array.from(
        { length: batchEnd - batchStart },
        (_, k) => batchStart + k
      );

      await Promise.all(
        batchIndices.map(async (i) => {
          const section = script.sections[i];

          // Skip graphic sections and sections with no audio
          if (section.section_type === "graphic" || !section.narration.trim() || !audioPaths[i]) {
            footagePathsPerSection[i] = null;
            // status already "skipped" from initialization
            return;
          }

          clips[i] = { ...clips[i], status: "downloading" };

          // Emit per-section start so UI reflects current activity immediately
          const readyCountPre = clips.filter((c) => c.status === "ready").length;
          const totalSearchable = clips.filter((c) => c.status !== "skipped").length;
          const pctPre = 50 + Math.round((i / script.sections.length) * 18);
          await emit(videoId, {
            stage: "footage" as Stage,
            progress: pctPre,
            message: `Finding clips for section ${i + 1}/${script.sections.length} (${readyCountPre}/${totalSearchable} ready)`,
            script,
            clips: [...clips],
          });

          // Wrap entire search+download in a hard cap to prevent any single
          // slow/hanging section from stalling the whole pipeline
          const sectionWork = async () => {
            try {
              // 1 clip per section — search is instant, 1 download fits in the cap.
              // The assembler's global pool fills any sections that fail with
              // borrowed clips at staggered offsets for visual variety.
              const foundClips = await findMultipleFootage(section, 1, videoId, usedIds);

              if (foundClips.length > 0) {
                const downloadedPaths: string[] = [];
                for (let ci = 0; ci < foundClips.length; ci++) {
                  try {
                    const p = await downloadClip(foundClips[ci], videoId, `${section.id}_${ci}`);
                    downloadedPaths.push(p);
                  } catch (dlErr) {
                    console.warn(`Section ${section.id} clip ${ci} download failed:`, (dlErr as Error).message);
                  }
                }

                if (downloadedPaths.length > 0) {
                  clips[i] = { ...foundClips[0], localPath: downloadedPaths[0], status: "ready" };
                  footagePathsPerSection[i] = downloadedPaths;
                } else {
                  clips[i] = { ...clips[i], status: "failed" };
                  footagePathsPerSection[i] = null;
                }
              } else {
                clips[i] = { ...clips[i], status: "failed" };
                footagePathsPerSection[i] = null;
              }
            } catch (err) {
              console.error(`Footage failed for section ${section.id}:`, err);
              clips[i] = { ...clips[i], status: "failed" };
              footagePathsPerSection[i] = null;
            }
          };

          // IMPORTANT: clearTimeout is required. Without it, the callback fires 35s
          // later even after sectionWork() already succeeded, overwriting the good
          // clips/footagePaths with null — making all sections appear to have failed.
          let hardTimeoutId: ReturnType<typeof setTimeout>;
          const hardTimeout = new Promise<void>((resolve) => {
            hardTimeoutId = setTimeout(() => {
              console.warn(`Section ${section.id} timed out after ${SECTION_HARD_CAP_MS}ms — skipping`);
              clips[i] = { ...clips[i], status: "failed" };
              footagePathsPerSection[i] = null;
              resolve();
            }, SECTION_HARD_CAP_MS);
          });

          await Promise.race([
            sectionWork().then(() => clearTimeout(hardTimeoutId!)),
            hardTimeout,
          ]);
        })
      );

      // Emit progress after each batch completes
      const readyCount = clips.filter((c) => c.status === "ready").length;
      const totalSearchable = clips.filter((c) => c.status !== "skipped").length;
      const pct = 50 + Math.round((batchEnd / script.sections.length) * 18);

      await emit(videoId, {
        stage: "footage" as Stage,
        progress: pct,
        message: `${readyCount}/${totalSearchable} clips ready`,
        script,
        clips: [...clips],
      });
    }
    // footagePathsPerSection: up to 3 diverse clips per section for 3-4s cuts
    // (NOTE: removed the old duplicate sequential loop that re-searched/re-downloaded
    // footage for every section a second time and pushed mismatched entries into
    // footagePathsPerSection, doubling search time and misaligning the array passed
    // to assemble())

    // ── Phase 4: Assembly ───────────────────────────────────────────────
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

    const bgmPath = await findBgm(script.mood);

    const validAudioPaths: (string | null)[] = script.sections.map((_, i) => audioPaths[i] || null);

    const { videoPath, thumbPath } = await assemble(
      videoId,
      title,
      script.sections,
      validAudioPaths,
      footagePathsPerSection,
      bgmPath,
      outputDir,
      async (step, total, label) => {
        const updatedSteps = renderSteps.map((s, idx) => ({
          ...s,
          done: idx < step,
        }));
        if (step < renderSteps.length) updatedSteps[step].done = false;

        const renderPct = Math.round((step / total) * 100);
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

    // ── Phase 5: Done ───────────────────────────────────────────────────
    const videoUrl = `/videos/${videoId}/final.mp4`;
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

    // Clean up temp working directory to keep /tmp lean
    const tmpDir = path.join("/tmp/vidrush", videoId);
    fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {});
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline failed for ${videoId}:`, err);
    await emit(videoId, {
      stage: "error" as Stage,
      progress: 0,
      message: `Pipeline failed: ${msg}`,
      errorMessage: msg,
    });
  }
}

async function findBgm(mood: string): Promise<string | null> {
  const moodDir = path.join(__dirname, "..", "assets", "music", mood);
  const fallbackDir = path.join(__dirname, "..", "assets", "music", "neutral");

  for (const dir of [moodDir, fallbackDir]) {
    try {
      const files = await fs.readdir(dir);
      const mp3s = files.filter((f) => f.endsWith(".mp3"));
      if (mp3s.length > 0) {
        const pick = mp3s[Math.floor(Math.random() * mp3s.length)];
        return path.join(dir, pick);
      }
    } catch {
      // directory doesn't exist
    }
  }
  return null;
}

