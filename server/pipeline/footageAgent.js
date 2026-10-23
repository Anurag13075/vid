import { promises as fs } from "fs";
import path from "path";
import os from "os";
import https from "https";
import http from "http";
import { createWriteStream } from "fs";
const CLIPS_PER_SECTION = 10;
function getTempDir(subpath = "") {
    const base = path.join(os.tmpdir(), "vidrush");
    return subpath ? path.join(base, subpath) : base;
}
export function createClipTracker() {
    return new Set();
}
function pickBestPexelsFile(videoFiles) {
    const valid = (videoFiles || []).filter((f) => f?.link && f?.width);
    if (valid.length === 0)
        return "";
    valid.sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280));
    return valid[0].link;
}
function pickBestPixabayUrl(hit) {
    return (hit?.videos?.medium?.url ||
        hit?.videos?.small?.url ||
        hit?.videos?.tiny?.url ||
        "");
}
// Stop words to strip when building topic fallback keywords from user's title
const STOP_WORDS = new Set([
    "from", "with", "that", "this", "your", "have", "will", "into", "they",
    "them", "then", "than", "when", "what", "which", "how", "for", "and",
    "the", "get", "rid", "but", "not", "can", "its", "are", "was", "has",
    "top", "best", "ways", "tips", "easy", "simple", "ultimate", "guide",
    "about", "some", "more", "very", "just", "been", "also", "over", "such",
]);
// Keywords that return useless generic stock footage — skip them
const BANNED_TERMS = [
    "cinematic", "background", "footage", "dramatic", "visual",
    "scene", "abstract", "generic", "video", "clip", "broll", "b-roll",
    "nature", "landscape", "beautiful", "stunning",
];
function sanitizeKeyword(kw) {
    const lower = kw.toLowerCase().trim();
    if (lower.length < 4)
        return "";
    if (BANNED_TERMS.some(b => lower.includes(b)))
        return "";
    return lower;
}
// Build topic-specific fallback keywords from the user's prompt title
function buildTopicFallbacks(title, section) {
    const words = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter(w => w.length > 2 && !STOP_WORDS.has(w));
    const coreWords = words.slice(0, 4).join(" ");
    const fallbacks = [];
    if (coreWords) {
        fallbacks.push(coreWords);
        fallbacks.push(`${coreWords} close up`);
        fallbacks.push(`${coreWords} tutorial`);
        fallbacks.push(`${coreWords} demonstration`);
    }
    if (section.key_point) {
        const kp = section.key_point.toLowerCase().slice(0, 50);
        if (kp.length > 4)
            fallbacks.push(kp);
    }
    if (words.length >= 2) {
        fallbacks.push(words.slice(0, 2).join(" "));
    }
    return fallbacks.filter(Boolean);
}
async function searchPexels(keyword, needed, usedIds) {
    const clips = [];
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=40&orientation=landscape&min_duration=4&max_duration=15`, {
            headers: { Authorization: process.env.PEXELS_API_KEY || "" },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
            console.warn(`Pexels "${keyword}": ${response.status}`);
            return clips;
        }
        const data = (await response.json());
        const videos = (data.videos || [])
            .filter((v) => !usedIds.has(`pexels_${v.id}`))
            .sort((a, b) => {
            const da = Math.abs((a.duration || 30) - 10);
            const db = Math.abs((b.duration || 30) - 10);
            return da - db;
        });
        for (const video of videos) {
            if (clips.length >= needed)
                break;
            const idStr = `pexels_${video.id}`;
            if (usedIds.has(idStr))
                continue;
            const videoUrl = pickBestPexelsFile(video.video_files);
            if (!videoUrl)
                continue;
            usedIds.add(idStr);
            clips.push({
                id: video.id,
                keyword,
                thumbUrl: video.image || "",
                videoUrl,
                source: "pexels",
                externalId: idStr,
                duration: video.duration || 10,
                status: "pending",
            });
        }
    }
    catch (err) {
        if (err?.name === "AbortError") {
            console.warn(`Pexels timed out: "${keyword}"`);
        }
        else {
            console.error(`Pexels search error for "${keyword}":`, err);
        }
    }
    return clips;
}
async function searchPixabay(keyword, needed, usedIds) {
    const clips = [];
    const apiKey = process.env.PIXABAY_API_KEY;
    if (!apiKey)
        return clips;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const response = await fetch(`https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=40&video_type=film&orientation=horizontal&min_duration=4&max_duration=15`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
            console.warn(`Pixabay "${keyword}": ${response.status}`);
            return clips;
        }
        const data = (await response.json());
        for (const hit of data.hits || []) {
            if (clips.length >= needed)
                break;
            const idStr = `pixabay_${hit.id}`;
            if (usedIds.has(idStr))
                continue;
            const videoUrl = pickBestPixabayUrl(hit);
            if (!videoUrl)
                continue;
            usedIds.add(idStr);
            clips.push({
                id: hit.id,
                keyword,
                thumbUrl: hit.videos?.medium?.thumbnail || "",
                videoUrl,
                source: "pixabay",
                externalId: idStr,
                duration: hit.duration || 10,
                status: "pending",
            });
        }
    }
    catch (err) {
        if (err?.name === "AbortError") {
            console.warn(`Pixabay timed out: "${keyword}"`);
        }
        else {
            console.error(`Pixabay search error for "${keyword}":`, err);
        }
    }
    return clips;
}
export async function findMultipleFootage(section, limit, videoId, usedIds, title) {
    const clips = [];
    const clipsNeeded = limit || CLIPS_PER_SECTION;
    const cleanKeywords = section.visual_keywords
        .map(sanitizeKeyword)
        .filter(Boolean);
    const keywordsToTry = cleanKeywords.length > 0
        ? cleanKeywords
        : [section.key_point?.toLowerCase().slice(0, 40) || title.toLowerCase().slice(0, 40)];
    // Phase 1: Pexels
    for (const keyword of keywordsToTry) {
        if (clips.length >= clipsNeeded)
            break;
        const found = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
        clips.push(...found);
    }
    // Phase 2: Pixabay
    if (clips.length < clipsNeeded) {
        for (const keyword of keywordsToTry) {
            if (clips.length >= clipsNeeded)
                break;
            const found = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
            clips.push(...found);
        }
    }
    // Phase 3: topic-derived fallback
    if (clips.length < clipsNeeded) {
        const topicFallbacks = buildTopicFallbacks(title, section);
        console.log(`[footage] Phase 3 fallback for "${keywordsToTry[0]}": trying topic keywords:`, topicFallbacks);
        for (const keyword of topicFallbacks) {
            if (clips.length >= clipsNeeded)
                break;
            const pexelsFound = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
            clips.push(...pexelsFound);
            if (clips.length < clipsNeeded) {
                const pixabayFound = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
                clips.push(...pixabayFound);
            }
        }
    }
    console.log(`[footage] Section "${keywordsToTry[0]}": ${clips.length}/${clipsNeeded} clips found`);
    return clips;
}
// Resilient downloader with redirect handling and streaming
function downloadUrlToFile(url, destPath, timeoutMs = 30000) {
    return new Promise((resolve, reject) => {
        const fileStream = createWriteStream(destPath);
        const client = url.startsWith("https") ? https : http;
        const request = client.get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
            // Handle HTTP redirects (301, 302, 307, 308)
            if (res.statusCode && [301, 302, 303, 307, 308].includes(res.statusCode) && res.headers.location) {
                fileStream.close();
                return downloadUrlToFile(res.headers.location, destPath, timeoutMs).then(resolve).catch(reject);
            }
            if (res.statusCode && res.statusCode >= 400) {
                fileStream.close();
                return reject(new Error(`Download failed with HTTP ${res.statusCode}`));
            }
            res.pipe(fileStream);
            fileStream.on("finish", () => {
                fileStream.close(() => resolve());
            });
        });
        request.on("error", (err) => {
            fileStream.close();
            fs.unlink(destPath).catch(() => { });
            reject(err);
        });
        request.setTimeout(timeoutMs, () => {
            request.destroy();
            fileStream.close();
            fs.unlink(destPath).catch(() => { });
            reject(new Error(`Download timed out after ${timeoutMs / 1000}s`));
        });
    });
}
export async function downloadClip(clip, videoId, suffix) {
    const tmpDir = getTempDir(videoId);
    await fs.mkdir(tmpDir, { recursive: true });
    const outPath = path.join(tmpDir, `${suffix}.mp4`);
    if (!clip.videoUrl)
        throw new Error("Clip has no videoUrl");
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            await downloadUrlToFile(clip.videoUrl, outPath, 35000);
            const stat = await fs.stat(outPath).catch(() => null);
            if (stat && stat.size > 2000) {
                return outPath;
            }
            throw new Error(`Downloaded file too small (${stat?.size ?? 0} bytes)`);
        }
        catch (err) {
            if (attempt === 3)
                throw err;
            await new Promise(r => setTimeout(r, 1000 * attempt));
        }
    }
    return outPath;
}
