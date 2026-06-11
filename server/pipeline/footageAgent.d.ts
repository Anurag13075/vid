import type { ScriptSection, Clip } from "./types.js";
export declare function resetUsedClips(): void;
export declare function findFootage(section: ScriptSection, videoId: string): Promise<Clip | null>;
export declare function downloadClip(clip: Clip, videoId: string, sectionId: number): Promise<string>;
