import type { SseListener, SseEvent } from "./types.js";
type JobFn = () => Promise<void>;
declare class JobQueue {
    private queue;
    private running;
    private sseListeners;
    enqueue(id: string, fn: JobFn): void;
    private drain;
    subscribe(id: string, listener: SseListener): () => void;
    emit(id: string, event: SseEvent): void;
    size(): number;
}
export declare const jobQueue: JobQueue;
export {};
