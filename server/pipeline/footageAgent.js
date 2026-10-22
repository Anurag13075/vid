import { promises as fs } from "fs";
import path from "path";
const CLIPS_PER_SECTION = 10;
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
// Broad enough to always return results, specific enough to look decent
const FALLBACK_KEYWORDS = [
    "nature forest sunlight trees",
    "aerial city buildings skyline",
    "ocean waves beach sunset",
    "mountain landscape snow peaks",
    "urban street people walking",
    "science laboratory equipment closeup",
    "hands working close up detail",
    "sky clouds timelapse blue",
    "river waterfall rocks flowing",
    "farm field harvest crops",
    "technology computer screen typing",
    "desert sand dunes golden",
    "rain window glass drops",
    "fire flames burning closeup",
    "crowd people event gathering",
];
// Keywords that return useless stock footage — skip them and fall to fallback
const BANNED_TERMS = [
    "cinematic", "background", "footage", "dramatic", "visual",
    "scene", "abstract", "generic", "video", "clip", "broll", "b-roll",
];
function sanitizeKeyword(kw) {
    const lower = kw.toLowerCase().trim();
    if (lower.length < 4)
        return "";
    if (BANNED_TERMS.some(b => lower.includes(b)))
        return "";
    return lower;
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
export async function findMultipleFootage(section, limit, videoId, usedIds) {
    const clips = [];
    const clipsNeeded = limit || CLIPS_PER_SECTION;
    // Strip generic keywords — they return unrelated stock footage
    const cleanKeywords = section.visual_keywords
        .map(sanitizeKeyword)
        .filter(Boolean);
    // If all keywords were generic, derive something from key_point or title
    const keywordsToTry = cleanKeywords.length > 0
        ? cleanKeywords
        : [section.key_point?.toLowerCase().slice(0, 40) || FALLBACK_KEYWORDS[0]];
    // Phase 1: specific keywords → Pexels
    for (const keyword of keywordsToTry) {
        if (clips.length >= clipsNeeded)
            break;
        const found = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
        clips.push(...found);
    }
    // Phase 2: specific keywords → Pixabay
    if (clips.length < clipsNeeded) {
        for (const keyword of keywordsToTry) {
            if (clips.length >= clipsNeeded)
                break;
            const found = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
            clips.push(...found);
        }
    }
    // Phase 3: fallback keywords → Pexels then Pixabay
    if (clips.length < clipsNeeded) {
        for (const keyword of FALLBACK_KEYWORDS) {
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
export async function downloadClip(clip, videoId, suffix) {
    const tmpDir = path.join("/tmp/vidrush", videoId);
    await fs.mkdir(tmpDir, { recursive: true });
    const outPath = path.join(tmpDir, `${suffix}.mp4`);
    if (!clip.videoUrl)
        throw new Error("Clip has no videoUrl");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
        const response = await fetch(clip.videoUrl, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
            throw new Error(`Download failed: ${response.status} ${response.statusText}`);
        }
        const buffer = await response.arrayBuffer();
        if (buffer.byteLength < 1000) {
            throw new Error(`Downloaded file too small (${buffer.byteLength} B)`);
        }
        await fs.writeFile(outPath, Buffer.from(buffer));
        return outPath;
    }
    catch (err) {
        clearTimeout(timer);
        if (err?.name === "AbortError") {
            throw new Error(`Download timed out after 25s: ${clip.videoUrl}`);
        }
        throw err;
    }
}
