import { promises as fs } from "fs";
import fsSync from "fs";
import path from "path";
import os from "os";
import { spawn } from "child_process";
import type { ScriptSection } from "./types.js";
import { ffmpeg, ffprobe } from "./ffmpeg.js";
import { getTempDir } from "./tempDir.js";

export { getTempDir };

// ─── Voice catalogue ────────────────────────────────────────────────────────
export const VOICES = [
  { id: "presenter_female",   label: "Aria · Warm Female",           tags: ["Female", "Warm", "American"],          elevenVoiceId: "21m00Tcm4TlvDq8ikWAM" },
  { id: "audiobook_female_1", label: "Ava · Natural Female",         tags: ["Female", "Natural", "American"],       elevenVoiceId: "EXAVITQu4vr4xnSDxMaL" },
  { id: "presenter_male",     label: "Brian · Deep Male",            tags: ["Male", "Deep", "American"],            elevenVoiceId: "pNInz6obpgDQGcFmaJgB" },
  { id: "audiobook_male_1",   label: "George · Authoritative",       tags: ["Male", "Authoritative", "British"],    elevenVoiceId: "JBFqnCBsd6RMkjVDRZzb" },
  { id: "newscast_male",      label: "Guy · Neutral Male",           tags: ["Male", "Neutral", "American"],         elevenVoiceId: "ErXwobaYiN019PkySvjV" },
  { id: "casual_guy",         label: "Andrew · Conversational Male", tags: ["Male", "Young", "American"],          elevenVoiceId: "TxGEqnHWrfWFTfGW9XjX" },
  { id: "wise_woman",         label: "Eleanor · Wise Female",        tags: ["Female", "Mature", "British"],         elevenVoiceId: "MF3mGyEYCl7XYWbV9V6O" },
  { id: "deep_space_master",  label: "Magnus · Epic Narrator",       tags: ["Male", "Epic", "American"],           elevenVoiceId: "VR6AewLTigWG4xSOukaG" },
  { id: "calm_woman",         label: "Serenity · Calm Female",       tags: ["Female", "Calm", "American"],          elevenVoiceId: "LcfcDJNUP1GQjkzn1xUU" },
  { id: "audiobook_female_2", label: "Grace · Storyteller Female",   tags: ["Female", "Young", "American"],         elevenVoiceId: "AZnzlk1XvdvUeBnXmlld" },
  { id: "audiobook_male_2",   label: "Drake · Documentary Male",     tags: ["Male", "Mature", "American"],         elevenVoiceId: "onwK4e9ZLuTAKqWW03F9" },
  { id: "newscast_female",    label: "Natalie · Professional Female",tags: ["Female", "Professional", "American"], elevenVoiceId: "ThT5KcBeYPX3keUQqHPh" },
];

const EDGE_VOICE_MAP: Record<string, string> = {
  presenter_female: "en-US-AriaNeural",
  audiobook_female_1: "en-US-AvaNeural",
  presenter_male: "en-US-BrianNeural",
  audiobook_male_1: "en-GB-RyanNeural",
  newscast_male: "en-US-GuyNeural",
  casual_guy: "en-US-AndrewNeural",
  wise_woman: "en-GB-SoniaNeural",
  deep_space_master: "en-US-ChristopherNeural",
  calm_woman: "en-US-JennyNeural",
  audiobook_female_2: "en-US-MichelleNeural",
  audiobook_male_2: "en-US-EricNeural",
  newscast_female: "en-US-AnaNeural",
  // Common aliases
  brian: "en-US-BrianNeural",
  Brian: "en-US-BrianNeural",
  christopher: "en-US-ChristopherNeural",
  Christopher: "en-US-ChristopherNeural",
  guy: "en-US-GuyNeural",
  Guy: "en-US-GuyNeural",
  aria: "en-US-AriaNeural",
  Aria: "en-US-AriaNeural",
  magnus: "en-US-ChristopherNeural",
  Magnus: "en-US-ChristopherNeural",
  andrew: "en-US-AndrewNeural",
  Andrew: "en-US-AndrewNeural",
};

const MALE_VOICES = new Set([
  "presenter_male",
  "audiobook_male_1",
  "newscast_male",
  "casual_guy",
  "deep_space_master",
  "audiobook_male_2",
  "brian",
  "Brian",
  "christopher",
  "Christopher",
  "guy",
  "Guy",
  "andrew",
  "Andrew",
  "magnus",
  "Magnus",
  "eric",
  "Eric",
  "ryan",
  "Ryan",
]);

const DEFAULT_ELEVEN_VOICE = "JBFqnCBsd6RMkjVDRZzb"; // George (reliable narrator)

function resolveElevenVoice(voiceId: string): string {
  const match = VOICES.find((v) => v.id === voiceId);
  return match?.elevenVoiceId ?? DEFAULT_ELEVEN_VOICE;
}

function cleanNarrationText(text: string): string {
  return text
    .replace(/\*+/g, "") // remove bold / italics
    .replace(/\[\d+\]/g, "") // remove citations
    .replace(/[#_~`]/g, "") // remove markdown symbols
    .replace(/\s+/g, " ")
    .trim();
}

// ─── Microsoft Edge Neural TTS (Pure Node.js WebSocket + CLI Fallback) ──────
async function generateEdgeTTS(text: string, voiceId: string, outputPath: string): Promise<void> {
  const isMale = MALE_VOICES.has(voiceId);
  const primaryEdgeVoice = EDGE_VOICE_MAP[voiceId] || (isMale ? "en-US-BrianNeural" : "en-US-AriaNeural");

  // Strict Gender & Timbre Preservation: NEVER mix male and female voices within a video!
  const voiceCandidates = isMale
    ? [primaryEdgeVoice, "en-US-BrianNeural", "en-US-ChristopherNeural", "en-US-GuyNeural", "en-US-EricNeural", "en-GB-RyanNeural"]
    : [primaryEdgeVoice, "en-US-AriaNeural", "en-US-AvaNeural", "en-US-JennyNeural", "en-GB-SoniaNeural"];

  const uniqueCandidates = Array.from(new Set(voiceCandidates));

  for (const edgeVoice of uniqueCandidates) {
    // Attempt 1: Native msedge-tts client
    try {
      const { MsEdgeTTS, OUTPUT_FORMAT } = await import("msedge-tts");
      const tts = new MsEdgeTTS();
      await tts.setMetadata(edgeVoice, OUTPUT_FORMAT.AUDIO_24KHZ_96KBITRATE_MONO_MP3);
      const tmpDir = path.dirname(outputPath);
      const subTmp = path.join(tmpDir, `edge_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`);
      await fs.mkdir(subTmp, { recursive: true });
      const res = await tts.toFile(subTmp, text);
      const generatedFile = res?.audioFilePath || path.join(subTmp, "audio.mp3");
      if (fsSync.existsSync(generatedFile)) {
        const stat = await fs.stat(generatedFile);
        if (stat.size > 500) {
          await fs.copyFile(generatedFile, outputPath);
          await fs.rm(subTmp, { recursive: true, force: true }).catch(() => {});
          return; // Success!
        }
      }
      await fs.rm(subTmp, { recursive: true, force: true }).catch(() => {});
    } catch (nodeErr: any) {
      console.warn(`[tts] msedge-tts (${edgeVoice}) attempt failed: ${nodeErr.message}`);
    }

    // Attempt 2: CLI candidates (edge-tts Python binary)
    const tempTextFile = outputPath + ".txt";
    await fs.writeFile(tempTextFile, text, "utf8");

    const candidates: { cmd: string; args: string[] }[] = [
      { cmd: "edge-tts", args: ["--voice", edgeVoice, "--file", tempTextFile, "--write-media", outputPath] },
      { cmd: "python3", args: ["-m", "edge_tts", "--voice", edgeVoice, "--file", tempTextFile, "--write-media", outputPath] },
      { cmd: "/usr/local/bin/edge-tts", args: ["--voice", edgeVoice, "--file", tempTextFile, "--write-media", outputPath] },
      { cmd: "/usr/bin/edge-tts", args: ["--voice", edgeVoice, "--file", tempTextFile, "--write-media", outputPath] },
      { cmd: "python", args: ["-m", "edge_tts", "--voice", edgeVoice, "--file", tempTextFile, "--write-media", outputPath] },
    ];

    for (const c of candidates) {
      try {
        await new Promise<void>((resolve, reject) => {
          const proc = spawn(c.cmd, c.args, { stdio: ["ignore", "pipe", "pipe"] });
          let stderr = "";
          proc.stderr.on("data", (d) => { stderr += d.toString(); });
          proc.on("close", (code) => {
            if (code === 0) resolve();
            else reject(new Error(`${c.cmd} exited with code ${code}: ${stderr}`));
          });
          proc.on("error", (err) => reject(err));
        });

        const stat = await fs.stat(outputPath).catch(() => null);
        if (stat && stat.size > 500) {
          await fs.unlink(tempTextFile).catch(() => {});
          return; // Success!
        }
      } catch {}
    }

    await fs.unlink(tempTextFile).catch(() => {});
  }

  throw new Error(`All neural TTS candidates for voice ${voiceId} failed`);
}

// ─── ElevenLabs TTS Generation ──────────────────────────────────────────────
async function generateElevenLabsTTS(
  text: string,
  voiceId: string,
  outputPath: string
): Promise<void> {
  const apiKey = (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is not set in environment");
  }

  const elevenVoice = resolveElevenVoice(voiceId);
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${elevenVoice}?output_format=mp3_44100_128`;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 60_000);

  try {
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.85,
          style: 0.15,
          use_speaker_boost: true,
        },
      }),
      signal: controller.signal,
    });

    clearTimeout(timer);

    if (!response.ok) {
      const errText = await response.text().catch(() => "");
      throw new Error(`ElevenLabs API error ${response.status}: ${errText}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    await fs.writeFile(outputPath, Buffer.from(arrayBuffer));
  } catch (err: any) {
    clearTimeout(timer);
    throw err;
  }
}

// ─── Public API ─────────────────────────────────────────────────────────────
export async function generateVoiceover(
  section: ScriptSection,
  videoId: string,
  voice: string
): Promise<{ audioPath: string; durationMs: number }> {
  const dir = getTempDir(path.join(videoId, "audio"));
  await fs.mkdir(dir, { recursive: true });

  const audioPath = path.join(dir, `section_${section.id}.mp3`);
  const rawText = section.narration.trim();
  const text = cleanNarrationText(rawText);

  // Graphic sections / empty narration → short silence placeholder
  if (!text || section.section_type === "graphic") {
    await generateSilence(audioPath, 2500);
    return { audioPath, durationMs: 2500 };
  }

  // 1. ElevenLabs TTS (if API key is present)
  const elevenKey = (process.env.ELEVENLABS_API_KEY || process.env.ELEVEN_LABS_API_KEY || "").trim();
  if (elevenKey) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        console.log(`[tts] ElevenLabs generating narration for section ${section.id} (${voice})...`);
        await generateElevenLabsTTS(text, voice, audioPath);
        const stat = await fs.stat(audioPath).catch(() => null);
        if (stat && stat.size > 200) {
          const durationMs = await getAudioDurationMs(audioPath);
          console.log(`[tts] ElevenLabs complete for section ${section.id}: ${(durationMs / 1000).toFixed(1)}s`);
          return { audioPath, durationMs };
        }
      } catch (err: any) {
        console.warn(`[tts] ElevenLabs attempt ${attempt} failed for section ${section.id}:`, err.message);
        if (attempt < 3) await sleep(1500 * attempt);
      }
    }
  }

  // 2. Microsoft Edge Neural TTS (Natural human voices: Brian, Christopher, Guy, Aria, etc.)
  for (let edgeAttempt = 1; edgeAttempt <= 3; edgeAttempt++) {
    try {
      console.log(`[tts] Synthesizing natural neural voiceover via Edge-TTS (${voice}) for section ${section.id} (attempt ${edgeAttempt})...`);
      await generateEdgeTTS(text, voice, audioPath);
      const stat = await fs.stat(audioPath).catch(() => null);
      if (stat && stat.size > 200) {
        const durationMs = await getAudioDurationMs(audioPath);
        console.log(`[tts] Edge-TTS complete for section ${section.id}: ${(durationMs / 1000).toFixed(1)}s`);
        return { audioPath, durationMs };
      }
    } catch (edgeErr: any) {
      console.warn(`[tts] Edge-TTS attempt ${edgeAttempt} failed for section ${section.id} (${edgeErr.message})`);
      if (edgeAttempt < 3) await sleep(1000 * edgeAttempt);
    }
  }

  // 3. Fallback: Proportional natural silence pacing (NEVER mix random genders)
  const estimatedMs = estimateDuration(text);
  console.log(`[tts] Section ${section.id}: pacing duration set to ${(estimatedMs / 1000).toFixed(1)}s`);
  await generateSilence(audioPath, estimatedMs);
  const durationMs = await getAudioDurationMs(audioPath);
  return { audioPath, durationMs };
}

// Quick synthesis for the UI voice preview endpoint
export async function synthesizeVoicePreview(voiceId: string, text: string): Promise<Buffer> {
  const tmpDir = getTempDir("previews");
  await fs.mkdir(tmpDir, { recursive: true });
  const tmpOut = path.join(tmpDir, `preview_${Date.now()}_${Math.random().toString(36).slice(2, 6)}.mp3`);
  try {
    await generateEdgeTTS(text, voiceId, tmpOut);
    return await fs.readFile(tmpOut);
  } finally {
    await fs.unlink(tmpOut).catch(() => {});
  }
}

// Natural documentary narration pacing: ~140-150 words per minute (approx 2.4 words per second)
function estimateDuration(text: string): number {
  const words = text.split(/\s+/).filter(Boolean).length;
  // 145 WPM = ~2.42 words per second. Minimum 3.5s.
  const seconds = Math.max(words / 2.4, 3.5);
  return Math.round(seconds * 1000);
}

async function generateSilence(outputPath: string, durationMs: number): Promise<void> {
  const sec = Math.max(durationMs / 1000, 0.5);
  await ffmpeg([
    "-f", "lavfi",
    "-i", "anullsrc=r=44100:cl=stereo",
    "-t", sec.toFixed(3),
    "-q:a", "5",
    "-acodec", "libmp3lame",
    "-y", outputPath,
  ]);
}

async function getAudioDurationMs(filePath: string): Promise<number> {
  const seconds = await ffprobe(filePath);
  return Math.round(seconds * 1000) || 5000;
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
