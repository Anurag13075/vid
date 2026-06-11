import { promises as fs } from "fs";
import path from "path";
const PEXELS_KEY = process.env.PEXELS_API_KEY || "";
const PIXABAY_KEY = process.env.PIXABAY_API_KEY || "";
const usedClipIds = new Set();
export function resetUsedClips() {
    usedClipIds.clear();
}
async function searchPexels(query) {
    if (!PEXELS_KEY)
        return null;
    try {
        const url = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&per_page=15&orientation=landscape&size=large`;
        const res = await fetch(url, { headers: { Authorization: PEXELS_KEY } });
        if (!res.ok)
            return null;
        const data = await res.json();
        for (const v of data.videos || []) {
            const clipId = `pexels_${v.id}`;
            if (usedClipIds.has(clipId))
                continue;
            if (v.duration < 6)
                continue;
            const best = v.video_files
                .filter((f) => f.file_type === "video/mp4" && f.width >= 1280)
                .sort((a, b) => b.width - a.width)[0];
            if (!best)
                continue;
            return {
                id: v.id,
                keyword: query,
                thumbUrl: v.image,
                videoUrl: best.link,
                source: "pexels",
                externalId: clipId,
                duration: v.duration,
                status: "pending",
            };
        }
    }
    catch (err) {
        console.error("Pexels search error:", err);
    }
    return null;
}
async function searchPixabay(query) {
    if (!PIXABAY_KEY)
        return null;
    try {
        const url = `https://pixabay.com/api/videos/?key=${PIXABAY_KEY}&q=${encodeURIComponent(query)}&video_type=film&per_page=15`;
        const res = await fetch(url);
        if (!res.ok)
            return null;
        const data = await res.json();
        for (const v of data.hits || []) {
            const clipId = `pixabay_${v.id}`;
            if (usedClipIds.has(clipId))
                continue;
            if (v.duration < 6)
                continue;
            const vid = v.videos.large || v.videos.medium || v.videos.small;
            if (!vid)
                continue;
            const thumb = `https://i.vimeocdn.com/video/${v.picture_id}_640x360.jpg`;
            return {
                id: v.id,
                keyword: query,
                thumbUrl: thumb,
                videoUrl: vid.url,
                source: "pixabay",
                externalId: clipId,
                duration: v.duration,
                status: "pending",
            };
        }
    }
    catch (err) {
        console.error("Pixabay search error:", err);
    }
    return null;
}
function buildSearchQueries(keyword) {
    const base = keyword.trim();
    return [
        base,
        `${base} cinematic close-up`,
        `${base} cinematic wide shot`,
        `${base} dramatic lighting`,
        `${base} motion`,
        `${base} aerial`,
        `${base} POV`,
        `${base} slow motion`,
        `${base} footage`,
    ];
}
function deriveKeywordsFromNarration(narration) {
    const phrases = narration
        .replace(/[\r\n]/g, " ")
        .split(/\s*[,\.\-–:]\s*/)
        .filter((p) => p.length >= 15 && p.length <= 60);
    return phrases.slice(0, 3).map((p) => p.trim());
}
export async function findFootage(section, videoId) {
    const keywords = section.visual_keywords.length > 0
        ? section.visual_keywords
        : deriveKeywordsFromNarration(section.narration);
    for (const kw of keywords) {
        const queries = buildSearchQueries(kw);
        for (const query of queries) {
            const clip = await searchPexels(query) || await searchPixabay(query);
            if (clip) {
                usedClipIds.add(clip.externalId);
                return { ...clip, localPath: undefined };
            }
        }
    }
    const fallbackQueries = [
        "cinematic documentary background",
        "dramatic cinematic footage",
        "dynamic motion background",
        "creative cityscape b-roll",
    ];
    for (const query of fallbackQueries) {
        const clip = await searchPexels(query) || await searchPixabay(query);
        if (clip) {
            usedClipIds.add(clip.externalId);
            return clip;
        }
    }
    return null;
}
export async function downloadClip(clip, videoId, sectionId) {
    const dir = path.join("/tmp/vidrush", videoId, "footage");
    await fs.mkdir(dir, { recursive: true });
    const localPath = path.join(dir, `section_${sectionId}.mp4`);
    if (clip.videoUrl.startsWith("http")) {
        const res = await fetch(clip.videoUrl);
        if (!res.ok)
            throw new Error(`Failed to download clip: ${res.status}`);
        const buffer = await res.arrayBuffer();
        await fs.writeFile(localPath, Buffer.from(buffer));
    }
    return localPath;
}
