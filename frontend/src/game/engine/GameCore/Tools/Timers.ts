// Delayed actions of a view, run from its Process: what the C++ views do with tweeny delays and stopwatches.

export class Timers {
  private next = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  /** Runs callback once delay milliseconds have passed; returns its id. */
  After(delay: number, callback: () => void) {
    const id = this.next++;
    this.timers.set(id, { at: performance.now() + delay, callback });
    return id;
  }

  Cancel(id: number | null | undefined) {
    if (id) this.timers.delete(id);
  }

  CancelAll() {
    this.timers.clear();
  }

  IsPending(id: number | null | undefined) {
    return !!id && this.timers.has(id);
  }

  Process(now = performance.now()) {
    for (const [id, timer] of [...this.timers].sort((a, b) => a[1].at - b[1].at)) {
      if (timer.at > now) continue;
      this.timers.delete(id);
      timer.callback();
    }
  }
}

/** Stopwatch::Measure, in milliseconds. */
/** Egt::GameCore::Stopwatch: the time it has run, in ms, which pauses and resumes. */
export class Stopwatch {
  private start = performance.now();
  private pausedAt: number | null = null;

  Measure() {
    return (this.pausedAt ?? performance.now()) - this.start;
  }

  Reset() {
    this.start = this.pausedAt ?? performance.now();
  }

  Pause() {
    this.pausedAt ??= performance.now();
  }

  Resume() {
    if (this.pausedAt === null) return;
    this.start += performance.now() - this.pausedAt;
    this.pausedAt = null;
  }

  IsRunning() {
    return this.pausedAt === null;
  }
}
