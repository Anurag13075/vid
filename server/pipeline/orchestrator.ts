import path from "path";
import { promises as fs } from "fs";
import { fileURLToPath } from "url";
import { generateScript } from "./scriptGenerator.js";
import { generateVoiceover, getTempDir } from "./voiceover.js";
import { createClipTracker, findMultipleFootage, downloadClip } from "./footageAgent.js";
import { assemble, RENDER_STEPS } from "./assembler.js";
import { updateVideo, getVideo } from "../db.js";
import { jobQueue } from "./queue.js";
import type { ScriptSection, Clip, SseEvent, Stage } from "./types.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

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

// ─── Standard Fresh Pipeline Run ────────────────────────────────────────────
export function startPipeline(videoId: string) {
  jobQueue.enqueue(videoId, () => runPipeline(videoId));
}

async function runPipeline(videoId: string) {
  const video = await getVideo(videoId);
  if (!video) return;

  const { title, voice, length, theme } = video;
  const vidrushTmp = getTempDir();
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

    await new Promise((r) => setTimeout(r, 1200));

    await emit(videoId, {
      stage: "writing" as Stage,
      progress: 15,
      message: "Generating documentary script...",
    });

    const script = await generateScript(title, length);

    await emit(videoId, {
      stage: "writing" as Stage,
      progress: 30,
      message: `Script ready — ${script.sections.length} sections`,
      script,
    });

    // ── Phase 2: Voiceover (Cached by scene) ─────────────────────────────
    await emit(videoId, {
      stage: "voiceover" as Stage,
      progress: 32,
      message: `Generating voiceover...`,
      script,
    });

    const audioPaths: (string | null)[] = [];
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

    // ── Phase 3: Footage Search & Download ──────────────────────────────
    const usedIds = createClipTracker();
    const clips: Clip[] = script.sections.map((s) => ({
      id: s.id,
      keyword: s.visual_keywords[0] || title.toLowerCase().slice(0, 40),
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
      message: "Finding matching stock footage clips...",
      script,
      clips,
    });

    const footagePathsPerSection: (string[] | null)[] = new Array(script.sections.length).fill(null);
    for (let i = 0; i < script.sections.length; i++) {
      const section = script.sections[i];
      if (section.section_type === "graphic" || !section.narration.trim() || !audioPaths[i]) {
        continue;
      }

      clips[i] = { ...clips[i], status: "downloading" };
      await emit(videoId, {
        stage: "footage" as Stage,
        progress: 50 + Math.round((i / script.sections.length) * 18),
        message: `Downloading visuals for scene ${i + 1}/${script.sections.length}`,
        script,
        clips: [...clips],
      });

      try {
        const foundClips = await findMultipleFootage(section, 6, videoId, usedIds, title);
        if (foundClips.length > 0) {
          const downloadedPaths: string[] = [];
          for (let ci = 0; ci < foundClips.length; ci++) {
            try {
              const p = await downloadClip(foundClips[ci], videoId, `${section.id}_${ci}`);
              downloadedPaths.push(p);
            } catch (dlErr) {}
          }

          if (downloadedPaths.length > 0) {
            clips[i] = { ...foundClips[0], localPath: downloadedPaths[0], status: "ready" };
            footagePathsPerSection[i] = downloadedPaths;
          } else {
            clips[i] = { ...clips[i], status: "failed" };
          }
        }
      } catch (err) {
        clips[i] = { ...clips[i], status: "failed" };
      }
    }

    // ── Phase 4: Assembly ───────────────────────────────────────────────
    await renderVideoAssembly(videoId, title, script.sections, audioPaths, footagePathsPerSection, theme, script.mood, clips, script);

  } catch (err) {
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
    affectedScenes?: number[]; // 1-based scene numbers that changed
    newVoice?: string;
    newTheme?: string;
    rewriteInstructions?: Array<{ sceneIndex: number; newNarration?: string; newKeywords?: string[] }>;
  }
) {
  jobQueue.enqueue(videoId, () => runIncrementalPipeline(videoId, options));
}

async function runIncrementalPipeline(
  videoId: string,
  options: {
    affectedScenes?: number[];
    newVoice?: string;
    newTheme?: string;
    rewriteInstructions?: Array<{ sceneIndex: number; newNarration?: string; newKeywords?: string[] }>;
  }
) {
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
    message: `Applying selective changes to ${affectedSet.size > 0 ? Array.from(affectedSet).map(s => `Scene ${s}`).join(", ") : "project"}...`,
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

  // 1. Re-generate voiceover only for affected scenes (or all if voice changed)
  const dir = getTempDir(path.join(videoId, "audio"));
  await fs.mkdir(dir, { recursive: true });

  const audioPaths: (string | null)[] = [];
  for (let i = 0; i < script.sections.length; i++) {
    const sceneNum = i + 1;
    const section = script.sections[i];
    const cachedAudio = path.join(dir, `section_${section.id}.mp3`);
    const exists = await fs.stat(cachedAudio).then(s => s.size > 200).catch(() => false);

    const mustRegenerate = options.newVoice || affectedSet.has(sceneNum) || !exists;

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

    // Check existing downloaded clips
    const existingClips = [0, 1, 2, 3].map(ci => path.join(clipDir, `${section.id}_${ci}.mp4`));
    const validExisting: string[] = [];
    for (const p of existingClips) {
      if (await fs.stat(p).then(s => s.size > 2000).catch(() => false)) {
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
      const found = await findMultipleFootage(section, 6, videoId, usedIds, video.title);
      const dlPaths: string[] = [];
      for (let ci = 0; ci < found.length; ci++) {
        try {
          const p = await downloadClip(found[ci], videoId, `${section.id}_${ci}`);
          dlPaths.push(p);
        } catch {}
      }
      footagePathsPerSection[i] = dlPaths.length > 0 ? dlPaths : validExisting;
    } else {
      footagePathsPerSection[i] = validExisting;
    }
  }

  // 3. Fast Re-assembly
  await renderVideoAssembly(videoId, video.title, script.sections, audioPaths, footagePathsPerSection, currentTheme, script.mood, clips, script);
}

// ─── Shared Assemble Step ───────────────────────────────────────────────────
async function renderVideoAssembly(
  videoId: string,
  title: string,
  sections: ScriptSection[],
  audioPaths: (string | null)[],
  footagePathsPerSection: (string[] | null)[],
  theme: string,
  mood: string,
  clips: Clip[],
  script: any
) {
  const renderSteps = RENDER_STEPS.map((s) => ({ ...s }));
  await emit(videoId, {
    stage: "rendering" as Stage,
    progress: 70,
    message: "Rendering final video composition with FFmpeg...",
    script,
    clips,
    renderSteps,
    renderProgress: 0,
  });

  const outputDir = path.resolve("data", "videos", videoId);
  await fs.mkdir(outputDir, { recursive: true });

  const bgmPath = null; // Clean narrator focus
  const validAudioPaths: (string | null)[] = sections.map((_, i) => audioPaths[i] || null);

  const { videoPath, thumbPath } = await assemble(
    videoId,
    title,
    sections,
    validAudioPaths,
    footagePathsPerSection,
    bgmPath,
    outputDir,
    async (step, total, label) => {
      const updatedSteps = renderSteps.map((s, idx) => ({ ...s, done: idx < step }));
      if (step < renderSteps.length) updatedSteps[step].done = false;
      const renderPct = Math.round((step / total) * 100);
      const overallPct = 70 + Math.round((step / total) * 28);

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
    theme
  );

  const videoUrl = `/videos/${videoId}/final.mp4`;
  const thumbnailUrl = `/videos/${videoId}/thumb.jpg`;

  await emit(videoId, {
    stage: "done" as Stage,
    progress: 100,
    message: "Video updated and ready for YouTube export!",
    script,
    clips,
    renderSteps: RENDER_STEPS.map((s) => ({ ...s, done: true })),
    renderProgress: 100,
    videoUrl,
    thumbnailUrl,
  });

  console.log(`✅ Video ${videoId} complete: ${videoPath}`);
}
