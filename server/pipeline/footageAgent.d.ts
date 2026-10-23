import type { ScriptSection, Clip } from "./types.js";
export declare function createClipTracker(): Set<string>;
export declare function findMultipleFootage(section: ScriptSection, limit: number, videoId: string, usedIds: Set<string>, title: string): Promise<Clip[]>;
export declare function downloadClip(clip: Clip, videoId: string, suffix: string): Promise<string>;
