import type { SseListener, SseEvent } from "./types.js";

type JobFn = () => Promise<void>;

class JobQueue {
  private queue: Array<{ id: string; fn: JobFn }> = [];
  private running = false;
  private sseListeners = new Map<string, Set<SseListener>>();

  enqueue(id: string, fn: JobFn) {
    this.queue.push({ id, fn });
    // Kick off drain only if not already running — the while loop inside handles queued jobs
    if (!this.running) this.drain();
  }

  private async drain() {
    if (this.running) return;
    this.running = true;

    // Use a while loop instead of recursive this.drain() call.
    // Recursion caused newly enqueued jobs to never start if enqueue() was called
    // during the await job.fn() — because running was still true when the recursive
    // drain() from finally ran, then set running=false, and the new enqueue's drain()
    // call had already returned early before the job completed.
    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      try {
        await job.fn();
      } catch (err) {
        console.error(`Job ${job.id} failed:`, err);
      }
    }

    this.running = false;
  }

  subscribe(id: string, listener: SseListener): () => void {
    if (!this.sseListeners.has(id)) this.sseListeners.set(id, new Set());
    this.sseListeners.get(id)!.add(listener);
    return () => this.sseListeners.get(id)?.delete(listener);
  }

  emit(id: string, event: SseEvent) {
    this.sseListeners.get(id)?.forEach((l) => l(event));
  }

  size() {
    return this.queue.length;
  }
}

export const jobQueue = new JobQueue();
