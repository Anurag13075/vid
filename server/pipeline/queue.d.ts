import type { SseListener, SseEvent } from "./types.js";
type JobFn = (signal: AbortSignal) => Promise<void>;
declare class JobQueue {
    private queue;
    private currentJob;
    private running;
    private sseListeners;
    enqueue(id: string, fn: JobFn): void;
    /**
     * Immediately cancels a job:
     * - If queued: removes it from the waiting list.
     * - If running: aborts the job's AbortController.
     */
    cancel(id: string): {
        cancelled: boolean;
        wasRunning: boolean;
    };
    isJobRunning(id: string): boolean;
    isJobQueued(id: string): boolean;
    getCurrentJobId(): string | null;
    private drain;
    subscribe(id: string, listener: SseListener): () => void;
    emit(id: string, event: SseEvent): void;
    size(): number;
}
export declare const jobQueue: JobQueue;
export {};
