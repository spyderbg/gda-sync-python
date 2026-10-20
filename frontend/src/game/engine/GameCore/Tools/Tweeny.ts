// The actions of tweeny (hpp/tweeny), which the C++ views animate with: an action changes values over a duration with an
// easing; actions run together or in sequence, after a delay, and call their on_begin and on_end handlers as they start
// and finish. tweeny::start, stop, stop_and_finish and is_running are Start, Stop, StopAndFinish and IsRunning; a view
// runs its actions in its Process.

export type Easing = (t: number) => number;

const BackOvershoot = 1.70158;

/** tweeny::ease (hat_libs/tweeny/tween_ease.h) */
export const ease = {
  linear: (t: number) => t,
  sine_start: (t: number) => 1 - Math.cos((t * Math.PI) / 2),
  sine_stop: (t: number) => Math.sin((t * Math.PI) / 2),
  sine_start_stop: (t: number) => -(Math.cos(Math.PI * t) - 1) / 2,
  quad_stop: (t: number) => 1 - (1 - t) * (1 - t),
  back_start: (t: number) => (BackOvershoot + 1) * t * t * t - BackOvershoot * t * t,
  back_stop: (t: number) => 1 + (BackOvershoot + 1) * (t - 1) ** 3 + BackOvershoot * (t - 1) ** 2,
};

export abstract class TweenAction {
  private m_begun = false;
  private m_ended = false;
  private m_start = 0;
  private m_running = false;
  private readonly m_onBegin: (() => void)[] = [];
  private readonly m_onEnd: (() => void)[] = [];

  abstract GetDuration(): number;

  /** Applies the action at a time since it starts, in ms. */
  protected abstract Apply(elapsed: number): void;

  /** on_begin.connect */
  OnBegin(handler: () => void) {
    this.m_onBegin.push(handler);
    return this;
  }

  /** on_end.connect */
  OnEnd(handler: () => void) {
    this.m_onEnd.push(handler);
    return this;
  }

  /** Makes the action begin again, as when it is started. */
  Reset() {
    this.m_begun = false;
    this.m_ended = false;
  }

  /** Runs the action at a time since it started: it begins at 0 and ends at its duration. */
  Update(elapsed: number) {
    if (elapsed < 0) return;
    if (!this.m_begun) {
      this.m_begun = true;
      for (const handler of this.m_onBegin) handler();
    }
    this.Apply(Math.min(elapsed, this.GetDuration()));
    if (elapsed >= this.GetDuration() && !this.m_ended) {
      this.m_ended = true;
      for (const handler of this.m_onEnd) handler();
    }
  }

  Start(now = performance.now()) {
    this.Reset();
    this.m_start = now;
    this.m_running = true;
    this.Process(now);
  }

  Stop() {
    this.m_running = false;
  }

  /** tweeny::stop_and_finish: the action's end, now. */
  StopAndFinish() {
    if (!this.m_running) this.Reset();
    this.m_running = false;
    this.Update(Number.POSITIVE_INFINITY);
  }

  IsRunning() {
    return this.m_running;
  }

  Process(now = performance.now()) {
    if (!this.m_running) return;
    const elapsed = now - this.m_start;
    if (elapsed >= this.GetDuration()) this.m_running = false;
    this.Update(elapsed);
  }
}

/** A change of values from 0 to 1 of its progress, eased. */
class Tween extends TweenAction {
  constructor(private readonly m_duration: number, private readonly m_apply: (progress: number) => void, private readonly m_ease: Easing) {
    super();
  }

  GetDuration() {
    return this.m_duration;
  }

  protected Apply(elapsed: number) {
    this.m_apply(this.m_ease(this.m_duration > 0 ? elapsed / this.m_duration : 1));
  }
}

class TogetherAction extends TweenAction {
  constructor(private readonly m_actions: TweenAction[]) {
    super();
  }

  GetDuration() {
    return Math.max(0, ...this.m_actions.map(action => action.GetDuration()));
  }

  Reset() {
    super.Reset();
    for (const action of this.m_actions) action.Reset();
  }

  protected Apply(elapsed: number) {
    for (const action of this.m_actions) action.Update(elapsed);
  }
}

class SequenceAction extends TweenAction {
  constructor(private readonly m_actions: TweenAction[]) {
    super();
  }

  GetDuration() {
    return this.m_actions.reduce((sum, action) => sum + action.GetDuration(), 0);
  }

  Reset() {
    super.Reset();
    for (const action of this.m_actions) action.Reset();
  }

  protected Apply(elapsed: number) {
    let start = 0;
    for (const action of this.m_actions) {
      action.Update(elapsed - start);
      start += action.GetDuration();
    }
  }
}

/** tweeny::together */
export function Together(...actions: (TweenAction | TweenAction[])[]): TweenAction {
  return new TogetherAction(actions.flat());
}

/** tweeny::sequence */
export function Sequence(...actions: (TweenAction | TweenAction[])[]): TweenAction {
  return new SequenceAction(actions.flat());
}

/** tweeny::delay */
export function Delay(duration: number): TweenAction {
  return new Tween(duration, () => {}, ease.linear);
}

export interface Position {
  x: number;
  y: number;
}

/** tweeny::move_from_to: moves a position from one point to another. */
export function MoveFromTo(target: Position, from: Position, to: Position, duration: number, easing: Easing = ease.linear): TweenAction {
  return new Tween(duration, t => {
    target.x = from.x + (to.x - from.x) * t;
    target.y = from.y + (to.y - from.y) * t;
  }, easing);
}

/** A number from one value to another, such as an alpha. */
export function ValueFromTo(set: (value: number) => void, from: number, to: number, duration: number, easing: Easing = ease.linear): TweenAction {
  return new Tween(duration, t => set(from + (to - from) * t), easing);
}
