// tweeny::tween_action (tweeny/tween_action.h/.cpp): a tween, which its updater runs over its duration. tweeny::start
// gives the manager a copy of it, under its id: a tween_action is a value, which C++ copies, and the browser's copy()
// does what the C++ copy does (combinators copy their tweens too).
//
// Its members C++ keeps private are tween_private's (the friend struct); the browser's have no access modifier.

import { event } from '../egt_hpp/event';
import { sentinel } from '../egt_hpp/sentinel';
import { type duration_t, type sentinel_t, state_t, type tween_id_t, tween_inspect_info } from './tween_common';
import * as inspector from './tween_inspector';

export type updater_t = (delta: duration_t, self: tween_action) => state_t;
export type creator_t = () => updater_t;

let unique_id = 1;

export class tween_action {
  /** Emit when tween is started. */
  on_begin = new event();
  /** Emit every time the tweened value is changed. */
  on_step = new event();
  /** Emit every frame when state of tween is running. */
  on_update = new event();
  /** Emit when tween is finished, if stop is called we consider it as interupt and on_end is not called. */
  on_end = new event();
  /** Emit when tween is paused and its state is changed. */
  on_pause = new event();
  /** Emit when tween is resumed and its state is changed. */
  on_resume = new event();
  /** Emit when stop is called. */
  on_stop = new event();

  info: tween_inspect_info | null = null;

  id_: tween_id_t = 0;
  creator_: creator_t | null = null;
  updater_: updater_t | null = null;

  pause_key_ = '';
  state_ = state_t.finished;

  elapsed_: duration_t = 0;
  elapsed_not_clamped_: duration_t = 0;
  duration_: duration_t = 0;

  sentinel_: sentinel_t = new sentinel();

  stop_and_finished_ = false;
  stop_when_finished_ = false;
  speed_multiplier_ = 1.0;

  /** tween_action(): an empty (not valid) action; tween_action(creator, duration, sentinel): one the creator updates. */
  constructor(creator?: creator_t, duration?: duration_t, sentinel?: sentinel_t) {
    if (!creator) return;
    this.id_ = unique_id++;
    this.creator_ = creator;
    this.duration_ = Math.max(duration ?? 0, 0);
    if (sentinel) this.sentinel_ = sentinel;
  }

  get_id(): tween_id_t {
    return this.id_;
  }

  is_valid() {
    return this.get_id() > 0;
  }

  /** The C++ copy: the same id, creator, state and inspector info, its own events' slots. A running action's updater is
   * shared (C++ copies its state), which tweeny never needs: it copies actions before they start. */
  copy() {
    const copy = new tween_action();
    Object.assign(copy, this);
    copy.on_begin = this.on_begin.copy();
    copy.on_step = this.on_step.copy();
    copy.on_update = this.on_update.copy();
    copy.on_end = this.on_end.copy();
    copy.on_pause = this.on_pause.copy();
    copy.on_resume = this.on_resume.copy();
    copy.on_stop = this.on_stop.copy();
    return copy;
  }

  update_elapsed(update_time: duration_t) {
    this.elapsed_ += update_time;
    this.elapsed_not_clamped_ += update_time;
    this.clamp_elapsed();
  }

  set_elapsed(elapsed: duration_t) {
    this.elapsed_ = elapsed;
    this.elapsed_not_clamped_ = elapsed;
    this.clamp_elapsed();
  }

  clamp_elapsed() {
    this.elapsed_ = Math.max(this.elapsed_, 0);
    this.elapsed_ = Math.min(this.elapsed_, this.duration_);
    this.elapsed_not_clamped_ = Math.max(this.elapsed_not_clamped_, 0);
  }

  start() {
    if (this.creator_ === null) return;
    this.state_ = state_t.running;
    this.elapsed_ = 0;
    this.elapsed_not_clamped_ = 0;
    this.on_begin.emit();
    this.updater_ = this.creator_();
    this.state_ = this.updater_(0, this);
    inspector.update_tween_state(this, this.state_);
    if (this.state_ === state_t.finished) {
      if (!this.sentinel_.expired()) this.on_end.emit();
    }
  }

  stop() {
    const oldState = this.state_;
    this.state_ = state_t.finished;
    inspector.update_tween_state(this, this.state_);
    if (oldState !== state_t.finished) this.on_stop.emit();
  }

  resume(key = '', force = false) {
    if (this.state_ === state_t.paused) {
      if (force || this.pause_key_ === key) {
        this.pause_key_ = '';
        this.state_ = state_t.running;
        this.on_resume.emit();
        inspector.update_tween_state(this, this.state_);
      }
    }
  }

  pause(key = '') {
    if (this.state_ === state_t.running) this.pause_forced(key);
  }

  /** pause_forced(key), or pause_forced(): keeps the key it has. */
  pause_forced(key?: string) {
    if (key !== undefined) this.pause_key_ = key;
    if (this.state_ !== state_t.paused) {
      this.state_ = state_t.paused;
      this.on_pause.emit();
    }
    inspector.update_tween_state(this, this.state_);
  }

  update(delta: duration_t): state_t {
    if (this.state_ === state_t.finished || this.state_ === state_t.paused) return this.state_;
    const update_time = (delta * Math.trunc(this.speed_multiplier_ * 1000.0)) / 1000;
    if (this.updater_) this.state_ = this.updater_(update_time, this);
    else this.stop();
    if (this.state_ === state_t.finished) {
      inspector.update_tween_state(this, this.state_);
      if (!this.sentinel_.expired()) this.on_end.emit();
    } else if (this.state_ === state_t.running) {
      this.on_update.emit();
    }
    return this.state_;
  }
}

/** A tween's id: what C++'s operator tween_id_t gives of an action. */
export function id_of(tween: tween_id_t | tween_action): tween_id_t {
  return typeof tween === 'number' ? tween : tween.get_id();
}
