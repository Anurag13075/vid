import os from "os";
import path from "path";
import fs from "fs";

export function getDataDir(subpath = "") {
    const base = process.env.VIDRUSH_DATA_DIR
        ? path.resolve(process.env.VIDRUSH_DATA_DIR)
        : path.resolve("data");
    return subpath ? path.join(base, subpath) : base;
}

export function getTempDir(subpath = "") {
    let base = process.env.TEMP_DIR;
    if (!base) {
        if (process.env.NODE_ENV === "production") {
            base = getDataDir("temp");
        }
        if (!base && process.platform === "win32" && fs.existsSync("D:\\")) {
            base = "D:\\vidrush_temp";
        }
        else if (!base) {
            base = path.join(os.tmpdir(), "vidrush");
        }
    }
    return subpath ? path.join(base, subpath) : base;
}
