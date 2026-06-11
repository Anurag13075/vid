export declare function query(text: string, params?: unknown[]): Promise<import("pg").QueryResult<any>>;
export declare function initDb(): Promise<void>;
export declare function getVideo(id: string): Promise<any>;
export declare function updateVideo(id: string, fields: Record<string, unknown>): Promise<void>;
export declare function createVideo(data: {
    id: string;
    title: string;
    voice: string;
    length: string;
    theme?: string;
    background?: string;
    mode?: string;
}): Promise<void>;
export declare function listVideos(): Promise<any[]>;
