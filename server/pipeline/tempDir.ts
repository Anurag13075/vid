import os from "os";
import path from "path";
import fs from "fs";

export function getDataDir(subpath: string = ""): string {
  const base = process.env.VIDRUSH_DATA_DIR
    ? path.resolve(process.env.VIDRUSH_DATA_DIR)
    : path.resolve("data");
  return subpath ? path.join(base, subpath) : base;
}

export function getTempDir(subpath: string = ""): string {
  let base = process.env.TEMP_DIR;
  if (!base) {
    // Production workers should keep intermediate audio and footage beside the
    // durable video output so a process restart can resume from its checkpoint.
    if (process.env.NODE_ENV === "production") {
      base = getDataDir("temp");
    }
    // If running on Windows and D:\ drive exists, prefer D:\vidrush_temp to avoid filling up C:
    if (!base && process.platform === "win32" && fs.existsSync("D:\\")) {
      base = "D:\\vidrush_temp";
    } else if (!base) {
      base = path.join(os.tmpdir(), "vidrush");
    }
  }
  return subpath ? path.join(base, subpath) : base;
}
