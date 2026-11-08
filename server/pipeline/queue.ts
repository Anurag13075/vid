import type { SseListener, SseEvent } from "./types.js";

type JobFn = (signal: AbortSignal) => Promise<void>;

interface QueuedJob {
  id: string;
  fn: JobFn;
}


interface RunningJob {
  id: string;
  controller: AbortController;
}

class JobQueue {
  private queue: QueuedJob[] = [];
  private currentJob: RunningJob | null = null;
  private running = false;
  private sseListeners = new Map<string, Set<SseListener>>();

  enqueue(id: string, fn: JobFn) {
    this.queue.push({ id, fn });
    if (!this.running) this.drain();
  }

  /**
   * Immediately cancels a job:
   * - If queued: removes it from the waiting list.
   * - If running: aborts the job's AbortController.
   */
  cancel(id: string): { cancelled: boolean; wasRunning: boolean } {
    // 1. If currently running, signal abort immediately
    if (this.currentJob && this.currentJob.id === id) {
      console.log(`[queue] Aborting currently running job: ${id}`);
      this.currentJob.controller.abort();
      return { cancelled: true, wasRunning: true };
    }


    // 2. If waiting in queue, remove it so it never executes
    const idx = this.queue.findIndex((job) => job.id === id);
    if (idx !== -1) {
      console.log(`[queue] Spliced waiting job out of queue: ${id}`);
      this.queue.splice(idx, 1);
      return { cancelled: true, wasRunning: false };
    }

    return { cancelled: false, wasRunning: false };
  }




  isJobRunning(id: string): boolean {
    return this.currentJob?.id === id;
  }

  isJobQueued(id: string): boolean {
    return this.queue.some((j) => j.id === id);
  }

  getCurrentJobId(): string | null {
    return this.currentJob?.id ?? null;
  }

  private async drain() {
    if (this.running) return;
    this.running = true;

    while (this.queue.length > 0) {
      const job = this.queue.shift()!;
      const controller = new AbortController();
      this.currentJob = { id: job.id, controller };

      try {
        await job.fn(controller.signal);
      } catch (err: any) {
        if (
          controller.signal.aborted ||
          err?.message?.includes("cancelled") ||
          err?.message?.includes("aborted")
        ) {
          console.log(`[queue] Job ${job.id} execution terminated via cancellation.`);
        } else {
          console.error(`[queue] Job ${job.id} failed:`, err);
        }
      } finally {
        this.currentJob = null;
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
