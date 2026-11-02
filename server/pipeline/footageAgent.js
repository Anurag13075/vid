import { promises as fs } from "fs";
import path from "path";
import https from "https";
import http from "http";
import { createWriteStream } from "fs";
import { getTempDir } from "./tempDir.js";
const CLIPS_PER_SECTION = 6;
export function createClipTracker() {
    return new Set();
}
function pickBestPexelsFile(videoFiles) {
    const valid = (videoFiles || []).filter((f) => f?.link && f?.width);
    if (valid.length === 0)
        return "";
    // Prioritize 720p (width ~1280) and 1080p (width ~1920) which are 3-10MB, avoid massive 4K files
    const hd = valid.filter((f) => f.width <= 1920 && f.width >= 960);
    if (hd.length > 0) {
        hd.sort((a, b) => Math.abs(a.width - 1280) - Math.abs(b.width - 1280));
        return hd[0].link;
    }
    valid.sort((a, b) => a.width - b.width);
    return valid[0].link;
}
function pickBestPixabayUrl(hit) {
    return (hit?.videos?.tiny?.url ||
        hit?.videos?.small?.url ||
        hit?.videos?.medium?.url ||
        hit?.videos?.large?.url ||
        "");
}
const STOP_WORDS = new Set([
    "from", "with", "that", "this", "your", "have", "will", "into", "they",
    "them", "then", "than", "when", "what", "which", "how", "for", "and",
    "the", "get", "rid", "but", "not", "can", "its", "are", "was", "has",
    "top", "best", "ways", "tips", "easy", "simple", "ultimate", "guide",
    "about", "some", "more", "very", "just", "been", "also", "over", "such",
]);
const BANNED_TERMS = [
    "cinematic", "background", "footage", "dramatic", "visual",
    "scene", "abstract", "generic", "video", "clip", "broll", "b-roll",
];
function sanitizeKeyword(kw) {
    const lower = kw.toLowerCase().trim();
    if (lower.length < 3)
        return "";
    if (BANNED_TERMS.some((b) => lower === b))
        return "";
    return lower;
}
function buildTopicFallbacks(title, section) {
    const words = title
        .toLowerCase()
        .replace(/[^a-z0-9\s]/g, "")
        .split(/\s+/)
        .filter((w) => w.length > 2 && !STOP_WORDS.has(w));
    const coreWords = words.slice(0, 3).join(" ");
    const fallbacks = [];
    if (coreWords) {
        fallbacks.push(coreWords);
        fallbacks.push(`${coreWords} historical`);
        fallbacks.push(`${coreWords} aerial`);
    }
    if (section.key_point) {
        const kpWords = section.key_point
            .toLowerCase()
            .replace(/[^a-z0-9\s]/g, "")
            .split(/\s+/)
            .filter((w) => w.length > 2 && !STOP_WORDS.has(w))
            .slice(0, 3)
            .join(" ");
        if (kpWords.length > 3)
            fallbacks.push(kpWords);
    }
    return fallbacks.filter(Boolean);
}
async function searchPexels(keyword, needed, usedIds) {
    const clips = [];
    const apiKey = (process.env.PEXELS_API_KEY || "sYsJWjfNBleX61WYAZfRlenvWr1z2UkP7LlbieI9igmsX1k7Tv8yD27G").trim();
    if (!apiKey)
        return clips;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const response = await fetch(`https://api.pexels.com/videos/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=landscape&min_duration=3&max_duration=25`, {
            headers: { Authorization: apiKey },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok) {
            console.warn(`[pexels] "${keyword}": HTTP ${response.status}`);
            return clips;
        }
        const data = (await response.json());
        const videos = (data.videos || [])
            .filter((v) => !usedIds.has(`pexels_${v.id}`))
            .sort((a, b) => {
            const da = Math.abs((a.duration || 10) - 8);
            const db = Math.abs((b.duration || 10) - 8);
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
                duration: video.duration || 8,
                license: "Pexels License (Free to use)",
                sourceUrl: video.url || `https://www.pexels.com/video/${video.id}/`,
                status: "pending",
            });
        }
    }
    catch (err) {
        if (err?.name !== "AbortError") {
            console.warn(`[pexels] search error for "${keyword}":`, err.message);
        }
    }
    return clips;
}
async function searchPixabay(keyword, needed, usedIds) {
    const clips = [];
    const apiKey = (process.env.PIXABAY_API_KEY || "56217573-a9df706c6c543d52b87c2dcb4").trim();
    if (!apiKey)
        return clips;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const response = await fetch(`https://pixabay.com/api/videos/?key=${apiKey}&q=${encodeURIComponent(keyword)}&per_page=30&video_type=all&orientation=horizontal&min_duration=3&max_duration=25`, { signal: controller.signal });
        clearTimeout(timer);
        if (!response.ok) {
            console.warn(`[pixabay] "${keyword}": HTTP ${response.status}`);
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
                thumbUrl: hit.videos?.medium?.thumbnail || hit.picture_id || "",
                videoUrl,
                source: "pixabay",
                externalId: idStr,
                duration: hit.duration || 8,
                license: "Pixabay Content License (Free for commercial use)",
                sourceUrl: hit.pageURL || `https://pixabay.com/videos/id-${hit.id}/`,
                status: "pending",
            });
        }
    }
    catch (err) {
        if (err?.name !== "AbortError") {
            console.warn(`[pixabay] search error for "${keyword}":`, err.message);
        }
    }
    return clips;
}
async function searchPexelsPhotos(keyword, needed, usedIds) {
    const clips = [];
    const apiKey = (process.env.PEXELS_API_KEY || "sYsJWjfNBleX61WYAZfRlenvWr1z2UkP7LlbieI9igmsX1k7Tv8yD27G").trim();
    if (!apiKey)
        return clips;
    try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12_000);
        const response = await fetch(`https://api.pexels.com/v1/search?query=${encodeURIComponent(keyword)}&per_page=30&orientation=landscape`, {
            headers: { Authorization: apiKey },
            signal: controller.signal,
        });
        clearTimeout(timer);
        if (!response.ok)
            return clips;
        const data = (await response.json());
        const photos = (data.photos || []).filter((p) => !usedIds.has(`pexels_photo_${p.id}`));
        for (const photo of photos) {
            if (clips.length >= needed)
                break;
            const idStr = `pexels_photo_${photo.id}`;
            if (usedIds.has(idStr))
                continue;
            const imageUrl = photo.src?.large2x || photo.src?.large || photo.src?.original;
            if (!imageUrl)
                continue;
            usedIds.add(idStr);
            clips.push({
                id: photo.id,
                keyword,
                thumbUrl: photo.src?.tiny || photo.src?.small || "",
                videoUrl: imageUrl,
                source: "pexels",
                externalId: idStr,
                duration: 8,
                license: "Pexels License (Free to use)",
                sourceUrl: photo.url || `https://www.pexels.com/photo/${photo.id}/`,
                status: "pending",
            });
        }
    }
    catch (err) { }
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
    // Phase 1: Pexels API
    for (const keyword of keywordsToTry) {
        if (clips.length >= clipsNeeded)
            break;
        const found = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
        clips.push(...found);
    }
    // Phase 2: Pixabay API
    if (clips.length < clipsNeeded) {
        for (const keyword of keywordsToTry) {
            if (clips.length >= clipsNeeded)
                break;
            const found = await searchPixabay(keyword, clipsNeeded - clips.length, usedIds);
            clips.push(...found);
        }
    }
    // Phase 3: Broad topic-derived fallback searches
    if (clips.length < clipsNeeded) {
        const topicFallbacks = buildTopicFallbacks(title, section);
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
    // Phase 4: High-Res Pexels Photos with Ken Burns Pan/Zoom Animation
    if (clips.length < clipsNeeded) {
        for (const keyword of keywordsToTry) {
            if (clips.length >= clipsNeeded)
                break;
            const photos = await searchPexelsPhotos(keyword, clipsNeeded - clips.length, usedIds);
            clips.push(...photos);
        }
    }
    // Phase 5: Guaranteed Universal Cinematic Abstract B-roll
    if (clips.length < clipsNeeded) {
        const genericQueries = ["technology abstract", "cinematic lights", "city timelapse", "business office", "motion background"];
        for (const keyword of genericQueries) {
            if (clips.length >= clipsNeeded)
                break;
            const pexelsFound = await searchPexels(keyword, clipsNeeded - clips.length, usedIds);
            clips.push(...pexelsFound);
            if (clips.length < clipsNeeded) {
                const photos = await searchPexelsPhotos(keyword, clipsNeeded - clips.length, usedIds);
                clips.push(...photos);
            }
        }
    }
    console.log(`[footage] Section ${section.id} ("${keywordsToTry[0]}"): ${clips.length}/${clipsNeeded} clips found`);
    return clips;
}
async function downloadUrlToFile(url, destPath, timeoutMs = 35000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, {
            headers: {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
            },
            signal: controller.signal,
            redirect: "follow",
        });
        if (!res.ok) {
            throw new Error(`Download failed with HTTP ${res.status}`);
        }
        const arrayBuffer = await res.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        if (buffer.length < 2000) {
            throw new Error(`Downloaded buffer too small (${buffer.length} bytes)`);
        }
        await fs.writeFile(destPath, buffer);
    }
    finally {
        clearTimeout(timer);
    }
}
export async function downloadClip(clip, videoId, suffix) {
    const tmpDir = getTempDir(videoId);
    await fs.mkdir(tmpDir, { recursive: true });
    const isImg = clip.externalId.includes("_photo_") || /\.(jpe?g|png|webp|avif)(\?|$)/i.test(clip.videoUrl);
    const ext = isImg ? "jpg" : "mp4";
    const outPath = path.join(tmpDir, `${suffix}.${ext}`);
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
            if (attempt === 3) {
                console.warn(`[footage] Failed download after 3 attempts (${clip.externalId}):`, err?.message);
                throw err;
            }
            await new Promise((r) => setTimeout(r, 1000 * attempt));
        }
    }
    return outPath;
}
