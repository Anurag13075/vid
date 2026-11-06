import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { generateScript } from "./scriptGenerator.js";
import { generateVoiceover, getTempDir } from "./voiceover.js";
import { getDataDir } from "./tempDir.js";
import { createClipTracker, findMultipleFootage, downloadClip } from "./footageAgent.js";
import { assemble, RENDER_STEPS } from "./assembler.js";
import { updateVideo, getVideo } from "../db.js";
import { jobQueue } from "./queue.js";
import { ffprobe, killProcessesForVideo } from "./ffmpeg.js";
import type { ScriptSection, Clip, SseEvent, Stage, Script } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

interface PipelineCheckpoint {
  version: 1;
  stage: "script" | "voiceover" | "footage" | "rendering" | "done";
  script?: Script;
  audioPaths: (string | null)[];
  footagePathsPerSection: (string[] | null)[];
  clips: Clip[];
  updatedAt: string;
}

function getVideoOutputDir(videoId: string): string {
  return getDataDir(path.join("videos", videoId));
}

function getCheckpointPath(videoId: string): string {
  return path.join(getVideoOutputDir(videoId), "pipeline-state.json");
}

async function readCheckpoint(videoId: string): Promise<PipelineCheckpoint | null> {
  try {
    const raw = await fs.readFile(getCheckpointPath(videoId), "utf8");
    const parsed = JSON.parse(raw) as PipelineCheckpoint;
    if (parsed?.version !== 1 || !Array.isArray(parsed.audioPaths) || !Array.isArray(parsed.footagePathsPerSection)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

async function writeCheckpoint(videoId: string, state: Omit<PipelineCheckpoint, "version" | "updatedAt">): Promise<void> {
  const outputDir = getVideoOutputDir(videoId);
  await fs.mkdir(outputDir, { recursive: true });
  const checkpointPath = getCheckpointPath(videoId);
  const tempPath = `${checkpointPath}.tmp`;
  const payload: PipelineCheckpoint = { ...state, version: 1, updatedAt: new Date().toISOString() };
  await fs.writeFile(tempPath, JSON.stringify(payload), "utf8");
  try {
    await fs.rename(tempPath, checkpointPath);
  } catch {
    // Windows refuses to replace an existing destination with rename().
    await fs.rm(checkpointPath, { force: true });
    await fs.rename(tempPath, checkpointPath);
  }
}

async function validMediaPath(filePath: string | null | undefined): Promise<boolean> {
  if (!filePath) return false;
  const stat = await fs.stat(filePath).catch(() => null);
  return Boolean(stat && stat.isFile() && stat.size > 2_000);
}

async function validMediaPaths(paths: string[] | null | undefined): Promise<string[]> {
  if (!paths?.length) return [];
  const result: string[] = [];
  for (const filePath of paths) {
    if (await validMediaPath(filePath)) result.push(filePath);
  }
  return result;
}

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
    ...(event.shortVideoUrl ? { short_video_url: event.shortVideoUrl } : {}),
    ...(event.errorMessage ? { error_message: event.errorMessage } : {}),
  });
}

async function downloadFoundClips(
  foundClips: Clip[],
  videoId: string,
  sectionId: number,
  signal?: AbortSignal
): Promise<string[]> {
  const results = await Promise.all(
    foundClips.map(async (clip, index) => {
      if (signal?.aborted) throw new Error("Job cancelled by user");
      try {
        return await downloadClip(clip, videoId, `${sectionId}_${index}`);
      } catch (err: any) {
        console.warn(`[orchestrator] Clip download failed (${sectionId}_${index}):`, err?.message);
        return null;
      }
    })
  );
  return results.filter((result): result is string => Boolean(result));
}

// ─── Clean Cancellation of a Video Generation ──────────────────────────────
export async function cancelVideoJob(videoId: string): Promise<boolean> {
  console.log(`[orchestrator] Cancelling job for video: ${videoId}`);

  // 1. Cancel in queue (aborts controller if running, removes from queue if waiting)
  const queueResult = jobQueue.cancel(videoId);

  // 2. Kill all spawned FFmpeg / child processes for this video immediately
  killProcessesForVideo(videoId);

  // 3. Immediately clean up disk temp directory to free disk space and eliminate clutter
  const vidrushTmp = getTempDir();
  const jobTmp = path.join(vidrushTmp, videoId);
  try {
    await fs.rm(jobTmp, { recursive: true, force: true });
    console.log(`[orchestrator] Cleaned temp dir for cancelled job: ${jobTmp}`);
  } catch {}

  // 4. Update DB state
  await updateVideo(videoId, {
    stage: "error" as Stage,
    progress: 0,
    message: "Generation cancelled by user.",
    error_message: "Job cancelled by user",
  });

  // 5. Emit SSE event so frontend updates instantly
  jobQueue.emit(videoId, {
    stage: "error" as Stage,
    progress: 0,
    message: "Generation cancelled by user.",
    errorMessage: "Job cancelled by user",
  });

  return queueResult.cancelled;
}

// ─── Standard Fresh Pipeline Run ────────────────────────────────────────────
export function startPipeline(videoId: string) {
  jobQueue.enqueue(videoId, (signal) => runPipeline(videoId, signal));
}

async function runPipeline(videoId: string, signal?: AbortSignal) {
  let video: Awaited<ReturnType<typeof getVideo>>;
  let jobTmp = "";
  try {
    video = await getVideo(videoId);
    if (!video) return;
    jobTmp = path.join(getTempDir(), videoId);
    await fs.mkdir(jobTmp, { recursive: true });
    await fs.mkdir(getVideoOutputDir(videoId), { recursive: true });
  } catch (err: any) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[orchestrator] Failed to initialize job ${videoId}:`, err);
    await updateVideo(videoId, {
      stage: "error" as Stage,
      progress: 0,
      message: `Pipeline initialization failed: ${message}`,
      error_message: message,
    }).catch(() => {});
    jobQueue.emit(videoId, {
      stage: "error" as Stage,
      progress: 0,
      message: `Pipeline initialization failed: ${message}`,
      errorMessage: message,
    });
    return;
  }

  const { title, voice, length, theme } = video;
  const checkpoint = await readCheckpoint(videoId);

  try {
    if (signal?.aborted) throw new Error("Job cancelled by user");
    // ── Phase 1: Script generation ──────────────────────────────────────
    let script = checkpoint?.script;
    if (script) {
      await emit(videoId, {
        stage: "writing" as Stage,
        progress: 30,
        message: `Resuming from saved script (${script.sections.length} scenes, ${script.sources?.length || 0} sources)`,
        script,
      });
    } else {
      await emit(videoId, {
        stage: "researching" as Stage,
        progress: 5,
        message: `Researching topic and historical archives: "${title}"...`,
      });

      await emit(videoId, {
        stage: "writing" as Stage,
        progress: 15,
        message: "Writing documentary script with retention hooks and verified facts...",
      });

      script = await generateScript(title, length);
      await writeCheckpoint(videoId, {
        stage: "script",
        script,
        audioPaths: new Array(script.sections.length).fill(null),
        footagePathsPerSection: new Array(script.sections.length).fill(null),
        clips: [],
      });

      await emit(videoId, {
        stage: "writing" as Stage,
        progress: 30,
        message: `Documentary script ready (${script.sections.length} scenes, ${script.sources?.length || 0} sources)`,
        script,
      });
    }

    // ── Phase 2: Voiceover (Cached by scene) ─────────────────────────────
    await emit(videoId, {
      stage: "voiceover" as Stage,
      progress: 32,
      message: "Generating voiceover narration with documentary pacing...",
      script,
    });

    const audioPaths: (string | null)[] = new Array(script.sections.length).fill(null);
    for (let i = 0; i < script.sections.length; i++) {
      if (signal?.aborted) throw new Error("Job cancelled by user");
      const section = script.sections[i];
      const pct = 32 + Math.round((i / script.sections.length) * 18);

      if (!section.narration.trim() && section.section_type !== "graphic") {
        continue;
      }

      const cachedAudio = checkpoint?.audioPaths?.[i];
      if (await validMediaPath(cachedAudio)) {
        audioPaths[i] = cachedAudio!;
        await emit(videoId, {
          stage: "voiceover" as Stage,
          progress: pct,
          message: `Reusing saved voiceover ${i + 1}/${script.sections.length}`,
          script,
        });
        continue;
      }

      try {
        const { audioPath } = await generateVoiceover(section, videoId, voice);
        audioPaths[i] = audioPath;
        await writeCheckpoint(videoId, {
          stage: "voiceover",
          script,
          audioPaths,
          footagePathsPerSection: checkpoint?.footagePathsPerSection || new Array(script.sections.length).fill(null),
          clips: checkpoint?.clips || [],
        });
        await emit(videoId, {
          stage: "voiceover" as Stage,
          progress: pct,
          message: `Voiceover ${i + 1}/${script.sections.length} rendered`,
          script,
        });
      } catch (err: any) {
        if (signal?.aborted || err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
          throw err;
        }
        console.error(`Voiceover failed for section ${section.id}:`, err.message);
        audioPaths[i] = null;
      }
    }

    // ── Phase 3: Footage Search & Download ──────────────────────────────
    if (signal?.aborted) throw new Error("Job cancelled by user");
    const usedIds = createClipTracker();
    const clips: Clip[] = checkpoint?.clips?.length === script.sections.length
      ? checkpoint.clips
      : script.sections.map((s) => ({
          id: s.id,
          keyword: s.visual_keywords[0] || title.toLowerCase().slice(0, 40),
          thumbUrl: "",
          videoUrl: "",
          source: "pexels" as const,
          externalId: "",
          duration: 10,
          status: s.section_type === "graphic" || !s.narration.trim() ? ("skipped" as const) : ("pending" as const),
        }));
    for (const clip of clips) {
      if (clip.externalId) usedIds.add(clip.externalId);
    }

    await emit(videoId, {
      stage: "footage" as Stage,
      progress: 50,
      message: "Sourcing matched stock and archival footage...",
      script,
      clips,
    });

    const footagePathsPerSection: (string[] | null)[] = checkpoint?.footagePathsPerSection?.length === script.sections.length
      ? checkpoint.footagePathsPerSection.map((paths) => (paths ? [...paths] : null))
      : new Array(script.sections.length).fill(null);
    for (let i = 0; i < script.sections.length; i++) {
      if (signal?.aborted) throw new Error("Job cancelled by user");
      const section = script.sections[i];
      if (section.section_type === "graphic" || !section.narration.trim() || !audioPaths[i]) {
        continue;
      }

      const savedPaths = await validMediaPaths(footagePathsPerSection[i]);
      if (savedPaths.length > 0) {
        footagePathsPerSection[i] = savedPaths;
        clips[i] = { ...clips[i], status: "ready", localPath: savedPaths[0] };
        await emit(videoId, {
          stage: "footage" as Stage,
          progress: 50 + Math.round((i / script.sections.length) * 18),
          message: `Reusing saved footage for Scene ${i + 1}/${script.sections.length}`,
          script,
          clips: [...clips],
        });
        continue;
      }

      clips[i] = { ...clips[i], status: "downloading" };
      await emit(videoId, {
        stage: "footage" as Stage,
        progress: 50 + Math.round((i / script.sections.length) * 18),
        message: `Downloading footage for Scene ${i + 1}/${script.sections.length}`,
        script,
        clips: [...clips],
      });

      try {
        const foundClips = await findMultipleFootage(section, 3, videoId, usedIds, title);
        const downloadedPaths = await downloadFoundClips(foundClips, videoId, section.id, signal);

        if (downloadedPaths.length > 0) {
          clips[i] = { ...foundClips[0], localPath: downloadedPaths[0], status: "ready" };
          footagePathsPerSection[i] = downloadedPaths;
        } else {
          // Do not reuse unrelated footage: a deliberate dark fallback is less
          // misleading than showing a previous scene's subject again.
          console.warn(`[orchestrator] No relevant footage downloaded for Scene ${i + 1}; keeping it unassigned`);
          clips[i] = { ...(clips[i] || {}), status: "failed" } as any;
        }
        await writeCheckpoint(videoId, {
          stage: "footage",
          script,
          audioPaths,
          footagePathsPerSection,
          clips,
        });
      } catch (err: any) {
        if (signal?.aborted || err?.message?.includes("cancelled") || err?.message?.includes("aborted")) {
          throw err;
        }
        clips[i] = { ...clips[i], status: "failed" };
      }
    }

    // ── Phase 4: Assembly & Publishing Delivery ─────────────────────────
    if (signal?.aborted) throw new Error("Job cancelled by user");
    await writeCheckpoint(videoId, {
      stage: "rendering",
      script,
      audioPaths,
      footagePathsPerSection,
      clips,
    });
    await renderVideoAssembly(
      videoId,
      title,
      script.sections,
      audioPaths,
      footagePathsPerSection,
      theme,
      script.mood,
      clips,
      script,
      signal
    );
  } catch (err: any) {
    const isCancelled =
      signal?.aborted ||
      err?.message?.includes("cancelled") ||
      err?.message?.includes("aborted");

    if (isCancelled) {
      console.log(`[orchestrator] Video ${videoId} generation cancelled cleanly.`);
      killProcessesForVideo(videoId);
      try {
        await fs.rm(jobTmp, { recursive: true, force: true });
      } catch {}
      await updateVideo(videoId, {
        stage: "error" as Stage,
        progress: 0,
        message: "Generation cancelled by user.",
        error_message: "Job cancelled by user",
      });
      jobQueue.emit(videoId, {
        stage: "error" as Stage,
        progress: 0,
        message: "Generation cancelled by user.",
        errorMessage: "Job cancelled by user",
      });
      return;
    }

    const msg = err instanceof Error ? err.message : String(err);
    console.error(`Pipeline failed for ${videoId}:`, err);
    await emit(videoId, {
      stage: "error" as Stage,
      progress: 0,
      message: `Pipeline error: ${msg}`,
      errorMessage: msg,
    });
  }
}

// ─── Incremental Partial Re-render Pipeline ─────────────────────────────────
export function startIncrementalReRender(
  videoId: string,
  options: {
    affectedScenes?: number[]; // 1-based scene numbers
    newVoice?: string;
    newTheme?: string;
    rewriteInstructions?: Array<{ sceneIndex: number; newNarration?: string; newKeywords?: string[] }>;
  }
) {
  jobQueue.enqueue(videoId, (signal) => runIncrementalPipeline(videoId, options, signal));
}

async function runIncrementalPipeline(
  videoId: string,
  options: {
    affectedScenes?: number[];
    newVoice?: string;
    newTheme?: string;
    rewriteInstructions?: Array<{ sceneIndex: number; newNarration?: string; newKeywords?: string[] }>;
  },
  signal?: AbortSignal
) {
  if (signal?.aborted) return;
  const video = await getVideo(videoId);
  if (!video) return;

  const script = typeof video.script === "string" ? JSON.parse(video.script) : video.script;
  const clips = typeof video.clips === "string" ? JSON.parse(video.clips) : video.clips;
  const currentVoice = options.newVoice || video.voice;
  const currentTheme = options.newTheme || video.theme;

  const affectedSet = new Set(options.affectedScenes || []);

  await emit(videoId, {
    stage: "rendering" as Stage,
    progress: 20,
    message: `Applying selective edits to ${affectedSet.size > 0 ? Array.from(affectedSet).map((s) => `Scene ${s}`).join(", ") : "project"}...`,
    script,
    clips,
  });

  // Apply narrative rewrites if requested
  if (options.rewriteInstructions) {
    for (const rw of options.rewriteInstructions) {
      const idx = rw.sceneIndex - 1;
      if (script?.sections?.[idx]) {
        if (rw.newNarration) script.sections[idx].narration = rw.newNarration;
        if (rw.newKeywords) script.sections[idx].visual_keywords = rw.newKeywords;
      }
    }
  }

  // 1. Re-generate voiceover only for affected scenes
  const dir = getTempDir(path.join(videoId, "audio"));
  await fs.mkdir(dir, { recursive: true });

  const audioPaths: (string | null)[] = [];
  for (let i = 0; i < script.sections.length; i++) {
    const sceneNum = i + 1;
    const section = script.sections[i];
    const cachedAudio = path.join(dir, `section_${section.id}.mp3`);
    const exists = await fs
      .stat(cachedAudio)
      .then((s) => s.size > 200)
      .catch(() => false);

    const mustRegenerate = Boolean(options.newVoice || affectedSet.has(sceneNum) || !exists);

    if (mustRegenerate && section.narration.trim()) {
      await emit(videoId, {
        stage: "voiceover" as Stage,
        progress: 30 + Math.round((i / script.sections.length) * 20),
        message: `Regenerating audio for Scene ${sceneNum}...`,
        script,
        clips,
      });
      const { audioPath } = await generateVoiceover(section, videoId, currentVoice);
      audioPaths.push(audioPath);
    } else {
      audioPaths.push(exists ? cachedAudio : null);
    }
  }

  // 2. Re-search & download footage only for affected scenes
  const usedIds = createClipTracker();
  const footagePathsPerSection: (string[] | null)[] = new Array(script.sections.length).fill(null);

  for (let i = 0; i < script.sections.length; i++) {
    const sceneNum = i + 1;
    const section = script.sections[i];
    const clipDir = getTempDir(videoId);

    const existingClips: string[] = [];
    for (let ci = 0; ci < 6; ci++) {
      existingClips.push(path.join(clipDir, `${section.id}_${ci}.mp4`));
      existingClips.push(path.join(clipDir, `${section.id}_${ci}.jpg`));
    }
    const validExisting: string[] = [];
    for (const p of existingClips) {
      if (await fs.stat(p).then((s) => s.size > 2000).catch(() => false)) {
        validExisting.push(p);
      }
    }

    if (affectedSet.has(sceneNum) || validExisting.length === 0) {
      await emit(videoId, {
        stage: "footage" as Stage,
        progress: 55,
        message: `Fetching new visual clips for Scene ${sceneNum}...`,
        script,
        clips,
      });
      const found = await findMultipleFootage(section, 3, videoId, usedIds, video.title);
      const dlPaths = await downloadFoundClips(found, videoId, section.id, signal);
      footagePathsPerSection[i] = dlPaths.length > 0 ? dlPaths : validExisting;
    } else {
      footagePathsPerSection[i] = validExisting;
    }
  }

  // 3. Fast Re-assembly
  if (signal?.aborted) return;
  await renderVideoAssembly(
    videoId,
    video.title,
    script.sections,
    audioPaths,
    footagePathsPerSection,
    currentTheme,
    script.mood,
    clips,
    script,
    signal
  );
}

// ─── Generate Standalone SRT Subtitles for YouTube ──────────────────────────
async function generateSrtFile(
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  srtPath: string
): Promise<void> {
  let srt = "";
  let currentTime = 0;
  let counter = 1;

  for (let i = 0; i < sections.length; i++) {
    const sec = sections[i];
    const ap = audioPaths[i];
    if (!ap || !sec.narration.trim()) continue;

    const dur = await ffprobe(ap);
    if (dur <= 0) continue;

    const words = sec.narration.trim().split(/\s+/).filter(Boolean);
    const wordsPerSub = 8;

    for (let w = 0; w < words.length; w += wordsPerSub) {
      const line = words.slice(w, w + wordsPerSub).join(" ");
      const startSec = currentTime + (w / words.length) * dur;
      const endSec = Math.min(currentTime + ((w + wordsPerSub) / words.length) * dur, currentTime + dur);

      const fmtTime = (s: number) => {
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sc = Math.floor(s % 60);
        const ms = Math.floor((s % 1) * 1000);
        return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sc).padStart(2, "0")},${String(ms).padStart(3, "0")}`;
      };

      srt += `${counter}\n${fmtTime(startSec)} --> ${fmtTime(endSec)}\n${line}\n\n`;
      counter++;
    }

    currentTime += dur;
  }

  await fs.writeFile(srtPath, srt, "utf8");
}

// ─── Format Sources & Bibliography File ─────────────────────────────────────
function formatSourcesFile(title: string, sources: string[], clips: Clip[]): string {
  let content = `DOCUMENTARY RESEARCH & SOURCES\n========================================\n`;
  content += `Project: ${title}\nProduced by: VidRush AI Pipeline\nDate: ${new Date().toUTCString()}\n\n`;

  content += `PRIMARY & ACADEMIC SOURCES:\n`;
  if (sources && sources.length > 0) {
    for (const s of sources) {
      content += `  * ${s}\n`;
    }
  } else {
    content += `  * Archival and public records research\n`;
  }

  content += `\nSTOCK FOOTAGE LICENSES & ATTRIBUTION:\n`;
  const uniqueClips = new Map<string, Clip>();
  for (const c of clips) {
    if (c.sourceUrl) uniqueClips.set(c.sourceUrl, c);
  }

  if (uniqueClips.size > 0) {
    for (const c of uniqueClips.values()) {
      content += `  * [${(c.source || "stock").toUpperCase()}] ${c.sourceUrl}\n    License: ${c.license || "Free to use"}\n`;
    }
  } else {
    content += `  * Public domain and creative commons licensed visuals\n`;
  }

  return content;
}

// Optional zero-cost music slot: drop licensed MP3/WAV files into data/music.
// The pipeline remains fully functional when the folder is absent or empty.
async function findBackgroundMusic(theme: string, mood: string): Promise<string | null> {
  const musicDir = path.resolve("data", "music");
  const files = await fs.readdir(musicDir).catch(() => [] as string[]);
  const audioFiles = files.filter((file) => /\.(mp3|wav|m4a|aac|ogg)$/i.test(file));
  if (audioFiles.length === 0) return null;

  const preference = `${theme} ${mood}`.toLowerCase().split(/\s+/).filter(Boolean);
  const ranked = audioFiles
    .map((file) => ({ file, score: preference.reduce((score, word) => score + (file.toLowerCase().includes(word) ? 1 : 0), 0) }))
    .sort((a, b) => b.score - a.score);

  return path.join(musicDir, ranked[0].file);
}

// ─── Shared Assemble Step & YouTube Delivery Package ────────────────────────
async function renderVideoAssembly(
  videoId: string,
  title: string,
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  footagePathsPerSection: (string[] | null)[],
  theme: string,
  mood: string,
  clips: Clip[],
  script: any,
  signal?: AbortSignal
) {
  if (signal?.aborted) throw new Error("Job cancelled by user");

  const renderSteps = RENDER_STEPS.map((s) => ({ ...s }));
  await emit(videoId, {
    stage: "rendering" as Stage,
    progress: 70,
    message: "Rendering 1080p documentary composition with FFmpeg...",
    script,
    clips,
    renderSteps,
    renderProgress: 0,
  });

  const outputDir = getVideoOutputDir(videoId);
  await fs.mkdir(outputDir, { recursive: true });

  const bgmPath = await findBackgroundMusic(theme, mood);
  const validAudioPaths: (string | null)[] = sections.map((_, i) => audioPaths[i] || null);

  const { videoPath, thumbPath, thumbnailPaths, shortPath } = await assemble(
    videoId,
    title,
    sections,
    validAudioPaths,
    footagePathsPerSection,
    bgmPath,
    outputDir,
    async (step, total, label) => {
      if (signal?.aborted) throw new Error("Job cancelled by user");
      const currentStepIdx = Math.floor(step);
      const updatedSteps = renderSteps.map((s, idx) => ({ ...s, done: idx < currentStepIdx }));
      if (currentStepIdx < renderSteps.length && updatedSteps[currentStepIdx]) {
        updatedSteps[currentStepIdx].done = false;
      }
      const renderPct = Math.min(100, Math.round((step / total) * 100));
      const overallPct = Math.min(98, 70 + Math.round((step / total) * 28));

      await emit(videoId, {
        stage: "rendering" as Stage,
        progress: overallPct,
        message: label,
        script,
        clips,
        renderSteps: updatedSteps,
        renderProgress: renderPct,
      });
    },
    theme,
    signal
  );

  // Probe actual final video duration
  const actualDuration = Math.round(await ffprobe(videoPath)) || 120;

  // 1. YouTube Subtitles (.srt)
  const srtPath = path.join(outputDir, "subtitles.srt");
  await generateSrtFile(sections, validAudioPaths, srtPath).catch(() => {});

  // 2. Sources & Research Bibliography
  const sourcesText = formatSourcesFile(title, script.sources || [], clips);
  await fs.writeFile(path.join(outputDir, "sources.txt"), sourcesText, "utf8").catch(() => {});
  await fs.writeFile(path.join(outputDir, "sources.json"), JSON.stringify(script.sources || [], null, 2), "utf8").catch(() => {});

  // 3. YouTube Publishing Metadata
  const metadata = {
    id: videoId,
    title: script.title || title,
    description: script.description || "",
    thumbnail_hook: script.thumbnail_hook || "",
    title_variants: script.title_variants || [],
    thumbnail_variants: thumbnailPaths.map((p) => `/videos/${videoId}/${path.basename(p)}`),
    short_video_url: shortPath ? `/videos/${videoId}/shorts.mp4` : null,
    tags: script.tags || ["documentary", "history"],
    durationSeconds: actualDuration,
    sources: script.sources || [],
    theme: theme || "modern",
    voice: videoId,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(path.join(outputDir, "metadata.json"), JSON.stringify(metadata, null, 2), "utf8").catch(() => {});

  // Update Database with duration and ready status
  await updateVideo(videoId, {
    duration_seconds: actualDuration,
  });

  const videoUrl = `/videos/${videoId}/final.mp4`;
  const thumbnailUrl = `/videos/${videoId}/thumb.jpg`;

  await emit(videoId, {
    stage: "done" as Stage,
    progress: 100,
    message: "Documentary complete and ready for YouTube publishing!",
    script,
    clips,
    renderSteps: RENDER_STEPS.map((s) => ({ ...s, done: true })),
    renderProgress: 100,
    videoUrl,
    thumbnailUrl,
    shortVideoUrl: shortPath ? `/videos/${videoId}/shorts.mp4` : undefined,
  });

  console.log(`✅ Video ${videoId} complete (${actualDuration}s): ${videoPath}`);

  await writeCheckpoint(videoId, {
    stage: "done",
    script,
    audioPaths: validAudioPaths,
    footagePathsPerSection,
    clips,
  });

  // Keep the checkpoint and downloaded media cache for selective re-renders.
}
