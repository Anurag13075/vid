import { spawn, spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";

// Prefer system ffmpeg (from nix/PATH) — spawnSync works in ESM, require() does not
const FFMPEG_PATH = (() => {
  const result = spawnSync("which", ["ffmpeg"], { encoding: "utf8" });
  if (result.status === 0 && result.stdout?.trim()) return result.stdout.trim();
  return (ffmpegStatic as string | null) || "ffmpeg";
})();

export { FFMPEG_PATH };
console.log(`[ffmpeg] using binary: ${FFMPEG_PATH}`);

// 10 minutes — enough for any single ffmpeg operation in the pipeline
const FFMPEG_TIMEOUT_MS = 10 * 60 * 1000;

function runProcess(
  command: string,
  args: string[]
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    const proc = spawn(command, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";

    proc.stdout?.on("data", (chunk: Buffer) => { stdout += chunk.toString(); });
    proc.stderr?.on("data", (chunk: Buffer) => { stderr += chunk.toString(); });

    const timer = setTimeout(() => {
      proc.kill("SIGKILL");
      reject(new Error(`${command} timed out after ${FFMPEG_TIMEOUT_MS / 1000}s`));
    }, FFMPEG_TIMEOUT_MS);

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) {
        resolve({ stdout, stderr });
      } else {
        reject(new Error(`${command} exited with code ${code}: ${stderr.slice(-3000)}`));
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      reject(err);
    });
  });
}

export async function ffmpeg(args: string[]): Promise<void> {
  try {
    await runProcess(FFMPEG_PATH, args);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`FFmpeg failed: ${message}\nCommand: ffmpeg ${args.join(" ")}`);
  }
}

// ─── ffprobe: try system binary first, then fallback via ffmpeg -i ────────────
async function probeWithFfprobe(filePath: string): Promise<number> {
  const { stdout } = await runProcess("ffprobe", [
    "-v", "error",
    "-show_entries", "format=duration",
    "-of", "default=noprint_wrappers=1:nokey=1",
    filePath,
  ]);
  const sec = parseFloat(stdout.trim());
  return Number.isFinite(sec) && sec > 0 ? sec : 0;
}

async function probeWithFfmpegFallback(filePath: string): Promise<number> {
  // ffmpeg -i prints duration to stderr even though it "fails" (no output file)
  let stderr = "";
  try {
    await runProcess(FFMPEG_PATH, [
      "-hide_banner", "-loglevel", "error",
      "-i", filePath,
      "-f", "null", "-",
    ]);
  } catch (err) {
    stderr = err instanceof Error ? err.message : String(err);
  }

  const match = stderr.match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/i);
  if (!match) return 0;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + parseFloat(match[3]);
}

export async function ffprobe(filePath: string): Promise<number> {
  // Try ffprobe binary
  try {
    const dur = await probeWithFfprobe(filePath);
    if (dur > 0) return dur;
  } catch {}

  // Fall back to parsing ffmpeg -i stderr
  try {
    const dur = await probeWithFfmpegFallback(filePath);
    if (dur > 0) return dur;
  } catch {}

  console.warn(`ffprobe: could not determine duration for ${filePath}, defaulting to 5s`);
  return 5;
}
