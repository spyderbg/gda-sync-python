// tweeny::create_tween_updater (tweeny/tween_updater.h): the updater of a tween of a value, which goes from what
// initialize_func gives as the tween begins to end, by interpolate (lerp) over the tween's duration.

import type { duration_t, ease_t, interpolate_t, sentinel_t } from './tween_common';
import { state_t } from './tween_common';
import type { tween_action, updater_t } from './tween_action';
import * as ease from './tween_ease';
import { lerp, value_equal, value_zero } from './tween_math';
import { tween_private } from './tween_private';

export function create_tween_updater<Object, T>(
  object: Object,
  end: T,
  sentinel: sentinel_t,
  initialize_func: (object: Object, sentinel: sentinel_t, self: tween_action) => T,
  update_func: (object: Object, next: T, self: tween_action) => void,
  getter: (object: Object, self: tween_action) => T,
  ease_func: ease_t = ease.linear,
  interpolate: interpolate_t<T> = lerp as unknown as interpolate_t<T>,
): updater_t {
  let begin: T = value_zero(end);
  let prev: T = value_zero(end);
  let start_required = true;
  let finished = false;
  return (delta: duration_t, self: tween_action) => {
    if (finished) return state_t.finished;

    if (sentinel.expired()) {
      finished = true;
      return state_t.finished;
    }

    if (tween_private.get_state(self) === state_t.finished) {
      finished = true;
      return state_t.finished;
    }

    if (tween_private.get_state(self) === state_t.paused) return state_t.paused;

    const duration = tween_private.get_duration(self);

    if (duration === 0) {
      const old_object = getter(object, self);
      const request_on_step = !value_equal(old_object, end);
      update_func(object, end, self);
      if (request_on_step) self.on_step.emit();
      if (!tween_private.is_stop_and_finished_requested(self)) {
        if (tween_private.get_state(self) === state_t.paused) return state_t.paused;
      }
      finished = true;
      return state_t.finished;
    }

    if (start_required) {
      const old_object = getter(object, self);
      begin = initialize_func(object, sentinel, self);
      start_required = false;
      const updated_object = getter(object, self);
      if (!value_equal(old_object, updated_object)) self.on_step.emit();
      if (!tween_private.is_stop_and_finished_requested(self)) {
        if (tween_private.get_state(self) === state_t.paused) return state_t.paused;
      }
      return state_t.running;
    }

    tween_private.update_elapsed(self, delta);
    const elapsed = tween_private.get_elapsed(self);

    const progress = elapsed / duration;
    const next = interpolate(begin, end, progress, ease_func);

    if (!value_equal(prev, next) || value_equal(next, end)) {
      update_func(object, next, self);
      self.on_step.emit();
      prev = next;
    }

    if (!tween_private.is_stop_and_finished_requested(self)) {
      if (tween_private.get_state(self) === state_t.paused) return state_t.paused;
    }

    if (elapsed === duration) {
      finished = true;
      return state_t.finished;
    }

    if (tween_private.get_state(self) === state_t.finished) {
      finished = true;
      return state_t.finished;
    }

    return state_t.running;
  };
}
