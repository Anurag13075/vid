import type { SseListener, SseEvent } from "./types.js";

type JobFn = () => Promise<void>;

class JobQueue {
  private queue: Array<{ id: string; fn: JobFn }> = [];
  private running = false;
  private sseListeners = new Map<string, Set<SseListener>>();

  enqueue(id: string, fn: JobFn) {
    this.queue.push({ id, fn });
    this.drain();
  }

  private async drain() {
    if (this.running || this.queue.length === 0) return;
    this.running = true;
    const job = this.queue.shift()!;
    try {
      await job.fn();
    } catch (err) {
      console.error(`Job ${job.id} failed:`, err);
    } finally {
      this.running = false;
      this.drain();
    }
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
