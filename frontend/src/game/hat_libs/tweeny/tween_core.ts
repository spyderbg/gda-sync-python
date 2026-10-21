// tweeny's tweens (tweeny/tween_core.h/.hpp/.cpp): of a value (tween_from_to, tween_to, tween_by), and of tweens:
// sequence, together, delay and repeat. A combinator copies its tweens, and each start of it copies them again, as the
// C++ lambdas capture them by value.
//
// C++ tweens a T& or a shared_ptr<T>; the browser's tweens a ref_t (ref(object, 'field')), with a sentinel.

import { eternal_sentinel, sentinel as sentinel_class } from '@game/hat_libs/egt_hpp/sentinel';
import { type duration_t, type ease_t, type ref_t, type sentinel_t, state_t } from './tween_common';
import { tween_action, type updater_t } from './tween_action';
import * as ease from './tween_ease';
import * as inspector from './tween_inspector';
import { value_add, value_sub, value_zero } from './tween_math';
import { tween_private } from './tween_private';
import { create_tween_updater } from './tween_updater';

export function tween_from_to<T>(object: ref_t<T>, begin: T, end: T, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  if (sentinel.expired()) return new tween_action();
  const creator = () => {
    const initialize_func = (object: ref_t<T>, sentinel: sentinel_t, self: tween_action) => {
      if (!sentinel.expired()) object.set(begin);
      inspector.update_begin_value(self, begin);
      return begin;
    };
    const updater_func = (object: ref_t<T>, next: T, self: tween_action) => {
      object.set(next);
      inspector.update_tween_status(self, object.get());
    };
    const getter_func = (object: ref_t<T>) => object.get();
    return create_tween_updater(object, end, sentinel, initialize_func, updater_func, getter_func, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, 'tween_from_to', object.get(), end, ease_func);
  return action;
}

export function tween_to<T>(object: ref_t<T>, end: T, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  if (sentinel.expired()) return new tween_action();
  const creator = () => {
    const initialize_func = (object: ref_t<T>, sentinel: sentinel_t, self: tween_action) => {
      if (sentinel.expired()) return value_zero(end);
      const begin = object.get();
      inspector.update_begin_value(self, begin);
      return begin;
    };
    const updater_func = (object: ref_t<T>, next: T, self: tween_action) => {
      object.set(next);
      inspector.update_tween_status(self, object.get());
    };
    const getter_func = (object: ref_t<T>) => object.get();
    return create_tween_updater(object, end, sentinel, initialize_func, updater_func, getter_func, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, 'tween_to', object.get(), end, ease_func);
  return action;
}

export function tween_by<T>(object: ref_t<T>, amount: T, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  if (sentinel.expired()) return new tween_action();
  const creator = () => {
    const initialize_func = (_object: ref_t<T>, _sentinel: sentinel_t, self: tween_action) => {
      const begin = value_zero(amount);
      inspector.update_begin_value(self, begin);
      return begin;
    };
    let prev = value_zero(amount);
    const updater_func = (object: ref_t<T>, next: T, self: tween_action) => {
      const step = value_sub(next, prev);
      object.set(value_add(object.get(), step));
      prev = next;
      inspector.update_tween_status(self, object.get());
    };
    const getter_func = (object: ref_t<T>) => object.get();
    return create_tween_updater(object, amount, sentinel, initialize_func, updater_func, getter_func, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, 'tween_by', object.get(), amount, ease_func);
  return action;
}

function sequence_impl(tweenies: readonly tween_action[], sentinel: sentinel_t, precise: boolean) {
  if (!tweenies.length) return new tween_action();

  let duration = 0;
  for (const tween of tweenies) duration += tween_private.get_duration(tween);

  const captured = tweenies.map(tween => tween.copy());
  const updater = (tweenies: tween_action[]): updater_t => {
    let current_tween_idx = 0;
    let prev_overflow = 0;
    let prev_elapsed = 0;
    let start_required = true;
    let finished = false;
    return (delta, self) => {
      if (finished) return state_t.finished;

      if (sentinel.expired()) {
        finished = true;
        return state_t.finished;
      }

      if (start_required) {
        tween_private.start(tweenies[current_tween_idx]);
        prev_elapsed = 0;
        start_required = false;
      }

      if (tween_private.is_stop_when_finished_requested(self)) {
        for (const tween of tweenies) tween_private.stop_when_finished(tween);
      }

      const current_tween = tweenies[current_tween_idx];

      if (precise) delta += prev_overflow;

      const state = tween_private.update(current_tween, delta);

      const elapsed = tween_private.get_elapsed(current_tween);
      const elapsed_diff = elapsed - prev_elapsed;
      prev_elapsed = elapsed;

      tween_private.update_elapsed(self, elapsed_diff);
      inspector.update_tween_status(self, current_tween_idx);
      self.on_step.emit();

      prev_overflow = 0;
      if (state === state_t.finished) {
        prev_overflow = tween_private.get_overflow(current_tween);
        current_tween_idx++;
        if (current_tween_idx === tweenies.length) {
          tween_private.update_elapsed(self, prev_overflow);
          finished = true;
          return state_t.finished;
        }
        start_required = true;
      }
      return state_t.running;
    };
  };

  const action = new tween_action(() => updater(captured.map(tween => tween.copy())), duration, sentinel);
  inspector.add_sequence_info(action, tweenies);
  return action;
}

/** The arguments of a combinator: a vector of tweens and a sentinel, or two or more tweens. */
type tweens_args = [tweenies: readonly tween_action[], sentinel?: sentinel_t] | [tween_action, tween_action, ...tween_action[]];

function tweens_of(args: tweens_args): [readonly tween_action[], sentinel_t] {
  if (Array.isArray(args[0])) return [args[0], (args[1] as sentinel_t | undefined) ?? eternal_sentinel()];
  return [args as tween_action[], eternal_sentinel()];
}

/** The tweens one after another. */
export function sequence(...args: tweens_args) {
  const [tweenies, sentinel] = tweens_of(args);
  return sequence_impl(tweenies, sentinel, false);
}

/** The tweens one after another, each starting with the time the one before ran over its end. */
export function sequence_precise(...args: tweens_args) {
  const [tweenies, sentinel] = tweens_of(args);
  return sequence_impl(tweenies, sentinel, true);
}

/** The tweens at once. */
export function together(...args: tweens_args) {
  const [tweenies, sentinel] = tweens_of(args);
  if (!tweenies.length) return new tween_action();

  let duration = 0;
  for (const tween of tweenies) duration = Math.max(tween_private.get_duration(tween), duration);

  const captured = tweenies.map(tween => tween.copy());
  const updater = (tweenies: tween_action[]): updater_t => {
    let start_required = true;
    let finished = false;
    return (delta, self) => {
      if (finished) return state_t.finished;

      if (sentinel.expired()) {
        finished = true;
        return state_t.finished;
      }

      if (start_required) {
        for (const tween of tweenies) tween_private.start(tween);
        start_required = false;
      }

      if (tween_private.is_stop_when_finished_requested(self)) {
        for (const tween of tweenies) tween_private.stop_when_finished(tween);
      }

      finished = true;
      for (const tween of tweenies) {
        const state = tween_private.update(tween, delta);
        finished &&= state === state_t.finished;
      }

      tween_private.update_elapsed(self, delta);
      inspector.update_tween_status(self);
      self.on_step.emit();

      if (finished) return state_t.finished;
      return state_t.running;
    };
  };

  const action = new tween_action(() => updater(captured.map(tween => tween.copy())), duration, sentinel);
  inspector.add_together_info(action, tweenies);
  return action;
}

export function delay(duration: duration_t, sentinel: sentinel_t = eternal_sentinel()) {
  const updater = (): updater_t => {
    let finished = false;
    return (delta, self) => {
      if (finished) return state_t.finished;

      if (sentinel.expired()) {
        finished = true;
        return state_t.finished;
      }

      tween_private.update_elapsed(self, delta);
      inspector.update_tween_status(self);

      self.on_step.emit();

      if (tween_private.get_elapsed(self) === tween_private.get_duration(self)) {
        finished = true;
        return state_t.finished;
      }

      return state_t.running;
    };
  };

  const action = new tween_action(updater, duration, sentinel);
  inspector.add_delay_info(action);
  return action;
}

function repeat_impl(tween: tween_action, times: number, precise: boolean, sentinel: sentinel_t = eternal_sentinel()) {
  const captured = tween.copy();
  const updater = (tween: tween_action): updater_t => {
    let elapsed = 0;
    let finished = false;
    let prev_overflow = 0;
    return (delta, self) => {
      if (finished) return state_t.finished;

      if (sentinel.expired()) {
        finished = true;
        return state_t.finished;
      }

      if (elapsed > 0) {
        if (tween_private.is_stop_when_finished_requested(self)) tween_private.stop_when_finished(tween);
      }

      if (precise) delta += prev_overflow;

      const state = tween_private.update(tween, delta);
      if (times > 0) inspector.update_tween_status(self, elapsed);

      self.on_step.emit();

      prev_overflow = 0;
      if (state === state_t.finished) {
        prev_overflow = tween_private.get_overflow(tween);
        if (elapsed > 0) {
          if (tween_private.is_stop_when_finished_requested(self)) {
            finished = true;
            return state_t.finished;
          }
        }

        if (times === 0) {
          tween_private.start(tween);
          elapsed++;
        } else {
          if (elapsed >= times) {
            finished = true;
            return state_t.finished;
          }
          tween_private.start(tween);
          elapsed++;
        }
      }
      return state_t.running;
    };
  };

  let duration = 0;
  if (times > 0) duration = times * tween_private.get_duration(tween);

  const action = new tween_action(() => updater(captured.copy()), duration, sentinel);
  inspector.add_repeat_info(action, tween, times);
  return action;
}

/** repeat(tween, times = 0) or repeat(tween, sentinel, times = 0): the tween again and again, times times, or forever. */
export function repeat(tween: tween_action, sentinel_or_times?: sentinel_t | number, times = 0) {
  if (sentinel_or_times instanceof sentinel_class) return repeat_impl(tween, times, false, sentinel_or_times);
  return repeat_impl(tween, sentinel_or_times ?? 0, false);
}

/** repeat, each time starting with the time the one before ran over its end. */
export function repeat_precise(tween: tween_action, sentinel_or_times?: sentinel_t | number, times = 0) {
  if (sentinel_or_times instanceof sentinel_class) return repeat_impl(tween, times, true, sentinel_or_times);
  return repeat_impl(tween, sentinel_or_times ?? 0, true);
}
