import { spawn } from "child_process";
import { promises as fs } from "fs";
import path from "path";
import type { ScriptSection } from "./types.js";

// ─── Voice catalogue ────────────────────────────────────────────────────────
// NOTE: Labels / IDs are kept identical to the original MiniMax list so that
// the frontend never needs to change.  The "voiceId" values are mapped to
// real edge-tts voice names inside VOICE_MAP below — invisible to the UI.
export const VOICES = [
  { id: "presenter_female",    label: "Aria · Warm Female",           tags: ["Female", "Warm", "American"] },
  { id: "audiobook_female_1",  label: "Ava · Natural Female",          tags: ["Female", "Natural", "American"] },
  { id: "presenter_male",      label: "Brian · Deep Male",             tags: ["Male", "Deep", "American"] },
  { id: "audiobook_male_1",    label: "Christopher · Authoritative",   tags: ["Male", "Authoritative", "American"] },
  { id: "newscast_male",       label: "Guy · Neutral Male",            tags: ["Male", "Neutral", "American"] },
  { id: "casual_guy",          label: "Andrew · Conversational Male",  tags: ["Male", "Young", "American"] },
  { id: "wise_woman",          label: "Eleanor · Wise Female",         tags: ["Female", "Mature", "British"] },
  { id: "deep_space_master",   label: "Magnus · Epic Narrator",        tags: ["Male", "Epic", "American"] },
  { id: "calm_woman",          label: "Serenity · Calm Female",        tags: ["Female", "Calm", "American"] },
  { id: "audiobook_female_2",  label: "Grace · Storyteller Female",    tags: ["Female", "Young", "American"] },
  { id: "audiobook_male_2",    label: "Drake · Documentary Male",      tags: ["Male", "Mature", "American"] },
  { id: "newscast_female",     label: "Natalie · Professional Female", tags: ["Female", "Professional", "American"] },
];

// Map internal voice IDs → edge-tts voice names.
// Default (any unrecognised id) → Christopher (deep authoritative male).
const VOICE_MAP: Record<string, string> = {
  presenter_female:   "en-US-AriaNeural",
  audiobook_female_1: "en-US-JennyNeural",
  presenter_male:     "en-US-BrianNeural",
  audiobook_male_1:   "en-US-ChristopherNeural",  // deep authoritative
  newscast_male:      "en-US-GuyNeural",
  casual_guy:         "en-US-AndrewNeural",
  wise_woman:         "en-GB-SoniaNeural",
  deep_space_master:  "en-US-ChristopherNeural",  // deepest available
  calm_woman:         "en-US-JennyNeural",
  audiobook_female_2: "en-US-AriaNeural",
  audiobook_male_2:   "en-US-ChristopherNeural",
  newscast_female:    "en-US-AriaNeural",
};

// Default voice used when the caller passes an unrecognised id or nothing
const DEFAULT_EDGE_VOICE = "en-US-ChristopherNeural";

function resolveEdgeVoice(voiceId: string): string {
  return VOICE_MAP[voiceId] ?? DEFAULT_EDGE_VOICE;
}

// ─── edge-tts via CLI subprocess ────────────────────────────────────────────
// edge-tts is installed as a Python CLI on Railway (pip install edge-tts).
// We call it as a child process so we stay in pure Node/TS with no Python SDK.

async function generateEdgeTTS(
  text: string,
  edgeVoice: string,
  outputPath: string
): Promise<void> {
  // edge-tts writes MP3 directly; no intermediate conversion needed.
  return new Promise((resolve, reject) => {
    // Timeout: 2 min — same as the old MiniMax timeout
    const TIMEOUT_MS = 120_000;

    const proc = spawn("edge-tts", [
      "--voice", edgeVoice,
      "--text", text,
      "--write-media", outputPath,
    ], { stdio: ["ignore", "ignore", "pipe"] });

    let stderr = "";
    proc.stderr?.on("data", (d: Buffer) => { stderr += d.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`edge-tts timed out after ${TIMEOUT_MS / 1000}s`));
    }, TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`edge-tts exited with code ${code}: ${stderr.slice(0, 400)}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      // "edge-tts not found" → clear message pointing to the fix
      if ((err as NodeJS.ErrnoException).code === "ENOENT") {
        reject(new Error(
          "edge-tts CLI not found. Install it on Railway: pip install edge-tts"
        ));
      } else {
        reject(err);
      }
    });
  });
}

// ─── Public API (unchanged shape — orchestrator calls this) ─────────────────

export async function generateVoiceover(
  section: ScriptSection,
  videoId: string,
  voice: string          // receives a MiniMax-style id like "deep_space_master"
): Promise<{ audioPath: string; durationMs: number }> {
  const dir = path.join("/tmp/vidrush", videoId, "audio");
  await fs.mkdir(dir, { recursive: true });

  const audioPath = path.join(dir, `section_${section.id}.mp3`);

  const text = section.narration.trim();

  // Graphic sections / empty narration → silence placeholder
  if (!text || section.section_type === "graphic") {
    await generateSilence(audioPath, 2000);
    return { audioPath, durationMs: 2000 };
  }

  const edgeVoice = resolveEdgeVoice(voice);

  let lastErr: Error | null = null;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      await generateEdgeTTS(text, edgeVoice, audioPath);

      const stat = await fs.stat(audioPath).catch(() => null);
      if (!stat || stat.size < 100) {
        throw new Error(
          `edge-tts produced no audio (file size: ${stat?.size ?? 0} bytes)`
        );
      }

      const durationMs = await getAudioDurationMs(audioPath);
      return { audioPath, durationMs };
    } catch (err) {
      lastErr = err as Error;
      console.error(
        `edge-tts attempt ${attempt} failed for section ${section.id}:`,
        (err as Error).message
      );

      // "not found" is fatal — no point retrying
      if ((err as Error).message.includes("CLI not found")) {
        throw err;
      }

      if (attempt < 3) await sleep(2000 * attempt);
    }
  }

  // All retries exhausted — fall back to proportional silence so the video
  // still assembles (sections will be muted but the file will be valid)
  console.error(
    `All edge-tts attempts failed for section ${section.id}, using silence`
  );
  await generateSilence(audioPath, estimateDuration(text));
  const durationMs = await getAudioDurationMs(audioPath);
  return { audioPath, durationMs };
}

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Estimate spoken duration from word count at ~2.8 words/sec */
function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.round((words / 2.8) * 1000);
}

async function generateSilence(outputPath: string, durationMs: number): Promise<void> {
  const sec = Math.max(durationMs / 1000, 0.5);
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-f", "lavfi",
      "-i", "anullsrc=r=44100:cl=stereo",
      "-t", String(sec),
      "-q:a", "9",
      "-acodec", "libmp3lame",
      "-y", outputPath,
    ], { stdio: "ignore" });
    proc.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`silence gen failed: ${code}`))
    );
    proc.on("error", reject);
  });
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  return new Promise((resolve) => {
    const proc = spawn("ffprobe", [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    let out = "";
    proc.stdout.on("data", (d: Buffer) => { out += d.toString(); });
    proc.on("close", (code) => {
      if (code === 0) {
        const sec = parseFloat(out.trim());
        resolve(isNaN(sec) ? 5000 : Math.round(sec * 1000));
      } else {
        resolve(5000);
      }
    });
    proc.on("error", () => resolve(5000));
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}