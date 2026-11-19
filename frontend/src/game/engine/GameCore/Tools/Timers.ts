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

/** Egt::Game::Stopwatch (Game/Utils/Stopwatch.h/.cpp): the time it has run on the game Clock, in ms, which pauses and
 * resumes. Reset starts it again from 0, running, and returns the time it had run. */
export class Stopwatch {
  private m_resumeTime = Clock.now();
  private m_pauseTime: number | null = null;
  private m_accumulated = 0;

  IsRunning() {
    return this.m_pauseTime === null;
  }

  Pause() {
    if (!this.IsRunning()) return;
    this.m_pauseTime = Clock.now();
    this.m_accumulated += this.m_pauseTime - this.m_resumeTime;
  }

  Resume() {
    if (this.IsRunning()) return;
    this.m_resumeTime = Clock.now();
    this.m_pauseTime = null;
  }

  Measure() {
    let elapsed = this.m_accumulated;
    if (this.IsRunning()) {
      elapsed += Clock.now() - this.m_resumeTime;
    }
    return elapsed;
  }

  Reset() {
    /// Note: don't implenet as Measure + Constructor because Clock::now() must be called only once to be accurate.
    const now = Clock.now();
    let elapsed = this.m_accumulated;
    if (this.IsRunning()) {
      elapsed += now - this.m_resumeTime;
    }
    this.m_resumeTime = now;
    this.m_pauseTime = null;
    this.m_accumulated = 0;
    return elapsed;
  }
}
