class JobQueue {
    queue = [];
    running = false;
    sseListeners = new Map();
    enqueue(id, fn) {
        this.queue.push({ id, fn });
        this.drain();
    }
    async drain() {
        if (this.running || this.queue.length === 0)
            return;
        this.running = true;
        const job = this.queue.shift();
        try {
            await job.fn();
        }
        catch (err) {
            console.error(`Job ${job.id} failed:`, err);
        }
        finally {
            this.running = false;
            this.drain();
        }
    }
    subscribe(id, listener) {
        if (!this.sseListeners.has(id))
            this.sseListeners.set(id, new Set());
        this.sseListeners.get(id).add(listener);
        return () => this.sseListeners.get(id)?.delete(listener);
    }
    emit(id, event) {
        this.sseListeners.get(id)?.forEach((l) => l(event));
    }
    size() {
        return this.queue.length;
    }
}
export const jobQueue = new JobQueue();
