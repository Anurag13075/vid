import os from "os";
import path from "path";
import fs from "fs";
export function getTempDir(subpath = "") {
    let base = process.env.TEMP_DIR;
    if (!base) {
        // If running on Windows and D:\ drive exists, prefer D:\vidrush_temp to avoid filling up C:
        if (process.platform === "win32" && fs.existsSync("D:\\")) {
            base = "D:\\vidrush_temp";
        }
        else {
            base = path.join(os.tmpdir(), "vidrush");
        }
    }
    return subpath ? path.join(base, subpath) : base;
}
