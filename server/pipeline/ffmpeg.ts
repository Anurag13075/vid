import { spawn, spawnSync } from "child_process";
import ffmpegStatic from "ffmpeg-static";
import path from "path";
import fs from "fs";

// Resolve FFmpeg binary cross-platform
const FFMPEG_PATH = (() => {
  // Use ffmpeg-static npm binary
  if (ffmpegStatic && fs.existsSync(ffmpegStatic)) {
    return ffmpegStatic;
  }

  // System fallback
  const isWindows = process.platform === "win32";
  const cmd = isWindows ? "where.exe" : "which";
  try {
    const result = spawnSync(cmd, ["ffmpeg"], { encoding: "utf8" });
    if (result.status === 0 && result.stdout?.trim()) {
      return result.stdout.trim().split("\r\n")[0].split("\n")[0];
    }
  } catch {}

  return "ffmpeg";
})();

export { FFMPEG_PATH };

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

// ─── Fast, reliable synchronous audio/video duration probe ───────────────────
export async function ffprobe(filePath: string): Promise<number> {
  try {
    const res = spawnSync(FFMPEG_PATH, [
      "-hide_banner",
      "-i", filePath,
    ], { encoding: "utf8", timeout: 10000 });

    const match = (res.stderr || "").match(/Duration:\s*(\d+):(\d+):(\d+\.?\d*)/i);
    if (match) {
      const dur = Number(match[1]) * 3600 + Number(match[2]) * 60 + parseFloat(match[3]);
      if (Number.isFinite(dur) && dur > 0) return dur;
    }
  } catch (err) {
    console.warn(`[ffprobe] probing ${filePath} failed:`, (err as Error).message);
  }

  console.warn(`[ffprobe] could not determine duration for ${filePath}, defaulting to 5s`);
  return 5;
}
