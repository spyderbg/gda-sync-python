// Delayed actions of a view, run from its Process: what the C++ views do with tweeny delays and stopwatches.

import { Clock } from '@game/engine/Game/Utils/Clock';

export class Timers {
  private next = 1;
  private readonly timers = new Map<number, { at: number; callback: () => void }>();

  /** Runs callback once delay milliseconds have passed; returns its id. */
  After(delay: number, callback: () => void) {
    const id = this.next++;
    this.timers.set(id, { at: Clock.now() + delay, callback });
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

  Process(now = Clock.now()) {
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
  private start = Clock.now();
  private pausedAt: number | null = null;

  Measure() {
    return (this.pausedAt ?? Clock.now()) - this.start;
  }

  Reset() {
    this.start = this.pausedAt ?? Clock.now();
  }

  Pause() {
    this.pausedAt ??= Clock.now();
  }

  Resume() {
    if (this.pausedAt === null) return;
    this.start += Clock.now() - this.pausedAt;
    this.pausedAt = null;
  }

  IsRunning() {
    return this.pausedAt === null;
  }
}
