// tweeny::tween_private (tweeny/tween_private.h): what tweeny itself does to an action's private state.

import type { duration_t } from './tween_common';
import { state_t } from './tween_common';
import type { tween_action } from './tween_action';

export const tween_private = {
  start(tween: tween_action) {
    tween.start();
  },

  stop(tween: tween_action) {
    tween.stop();
  },

  stop_and_finished(tween: tween_action) {
    tween.stop_and_finished_ = true;
  },

  stop_when_finished(tween: tween_action) {
    tween.stop_when_finished_ = true;
  },

  /** resume(tween, force), or resume(tween, key) */
  resume(tween: tween_action, force_or_key: boolean | string = false) {
    if (typeof force_or_key === 'string') tween.resume(force_or_key);
    else tween.resume('', force_or_key);
  },

  pause(tween: tween_action, key = '') {
    tween.pause(key);
  },

  pause_forced(tween: tween_action, key?: string) {
    tween.pause_forced(key);
  },

  set_speed_multiplier(tween: tween_action, speed_multiplier: number) {
    speed_multiplier = Math.min(100.0, speed_multiplier);
    speed_multiplier = Math.max(0.0, speed_multiplier);
    tween.speed_multiplier_ = speed_multiplier;
  },

  get_speed_multiplier(tween: tween_action) {
    return tween.speed_multiplier_;
  },

  get_state(tween: tween_action) {
    return tween.state_;
  },

  is_stop_when_finished_requested(tween: tween_action) {
    return tween.stop_when_finished_;
  },

  is_stop_and_finished_requested(tween: tween_action) {
    return tween.stop_and_finished_;
  },

  is_running(tween: tween_action) {
    return tween.state_ === state_t.running;
  },

  is_paused(tween: tween_action) {
    return tween.state_ === state_t.paused;
  },

  is_finished(tween: tween_action) {
    return tween.state_ === state_t.finished;
  },

  update(tween: tween_action, delta: duration_t) {
    return tween.update(delta);
  },

  set_elapsed(self: tween_action, elapsed: duration_t) {
    self.set_elapsed(elapsed);
  },

  update_elapsed(self: tween_action, update_time: duration_t) {
    self.update_elapsed(update_time);
  },

  get_elapsed(self: tween_action) {
    return self.elapsed_;
  },

  get_duration(self: tween_action) {
    return self.duration_;
  },

  get_remaining(self: tween_action) {
    return tween_private.get_duration(self) - tween_private.get_elapsed(self);
  },

  get_overflow(self: tween_action): duration_t {
    const duration = tween_private.get_duration(self);
    const elapsed_not_clamped = self.elapsed_not_clamped_;
    if (duration > 0 && duration <= elapsed_not_clamped) return elapsed_not_clamped - duration;
    return 0;
  },
};
