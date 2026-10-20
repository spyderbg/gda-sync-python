// tweeny's tweens of an object's value by its setter and getter (tweeny/tween_ex.h), which the extensions make theirs
// with: an element's position, a transform's scale... C++ takes the object's pointer: a null one makes an empty action.

import type { duration_t, ease_t, sentinel_t } from './tween_common';
import { tween_action } from './tween_action';
import * as inspector from './tween_inspector';
import { value_add, value_sub, value_zero } from './tween_math';
import { create_tween_updater } from './tween_updater';

export function create_tween_from_to_impl<Object, T>(creator_name: string, object: Object | null, begin: T, end: T,
  setter_func: (object: Object, value: T) => void, getter_func: (object: Object) => T, duration: duration_t, sentinel: sentinel_t,
  ease_func: ease_t) {
  if (!object) return new tween_action();
  const creator = () => {
    const initialize_func = (object: Object, _sentinel: sentinel_t, self: tween_action) => {
      setter_func(object, begin);
      inspector.update_begin_value(self, begin);
      return begin;
    };
    const updater_func = (object: Object, next: T, self: tween_action) => {
      setter_func(object, next);
      inspector.update_tween_status(self, getter_func(object));
    };
    const getter = (object: Object) => getter_func(object);
    return create_tween_updater(object, end, sentinel, initialize_func, updater_func, getter, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, creator_name, object, end, ease_func);
  return action;
}

export function create_tween_to_impl<Object, T>(creator_name: string, object: Object | null, end: T,
  setter_func: (object: Object, value: T) => void, getter_func: (object: Object) => T, duration: duration_t, sentinel: sentinel_t,
  ease_func: ease_t) {
  // C++ checks no null object here (its callers do)
  if (!object) return new tween_action();
  const creator = () => {
    const initialize_func = (object: Object, sentinel: sentinel_t, self: tween_action) => {
      if (sentinel.expired()) {
        const out = value_zero(end);
        inspector.update_begin_value(self, out);
        return out;
      }
      const out = getter_func(object);
      inspector.update_begin_value(self, out);
      return out;
    };
    const updater_func = (object: Object, next: T, self: tween_action) => {
      setter_func(object, next);
      inspector.update_tween_status(self, getter_func(object));
    };
    const getter = (object: Object) => getter_func(object);
    return create_tween_updater(object, end, sentinel, initialize_func, updater_func, getter, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, creator_name, object, end, ease_func);
  return action;
}

export function create_tween_by_impl<Object, T>(creator_name: string, object: Object | null, amount: T,
  setter_func: (object: Object, value: T) => void, getter_func: (object: Object) => T, duration: duration_t, sentinel: sentinel_t,
  ease_func: ease_t) {
  if (!object) return new tween_action();
  const creator = () => {
    const initialize_func = (_object: Object, _sentinel: sentinel_t, self: tween_action) => {
      const out = value_zero(amount);
      inspector.update_begin_value(self, out);
      return out;
    };
    let prev = value_zero(amount);
    const updater_func = (object: Object, next: T, self: tween_action) => {
      const current = getter_func(object);
      const updated = value_add(current, value_sub(next, prev));
      setter_func(object, updated);
      inspector.update_tween_status(self, getter_func(object));
      prev = next;
    };
    const getter = (object: Object) => getter_func(object);
    return create_tween_updater(object, amount, sentinel, initialize_func, updater_func, getter, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, creator_name, object, amount, ease_func);
  return action;
}
