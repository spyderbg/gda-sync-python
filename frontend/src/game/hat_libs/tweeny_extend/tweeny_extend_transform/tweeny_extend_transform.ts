// tweeny's tweens of a math::transformf (hat_libs/tweeny_extend/tweeny_extend_transform): its position, scale and
// rotation (Euler angles, in radians), and the shake, pulse and dangle made of them. C++ declares them in namespace
// tweeny, as the translator writes them.

import { type transformf, vec3 } from '../../egt_math/transform';
import type { duration_t, ease_t, sentinel_t } from '../../tweeny/tween_common';
import { sequence } from '../../tweeny/tween_core';
import { tween_action } from '../../tweeny/tween_action';
import * as ease from '../../tweeny/tween_ease';
import { create_tween_by_impl, create_tween_from_to_impl, create_tween_to_impl } from '../../tweeny/tween_ex';
import * as inspector from '../../tweeny/tween_inspector';
import { clamp, value_mul, value_sub } from '../../tweeny/tween_math';
import { create_tween_updater } from '../../tweeny/tween_updater';

function shake_impl<T>(tr: transformf, force: T,
  action_creator: (tr: transformf, force: T, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t) => tween_action,
  duration: duration_t, sentinel: sentinel_t, count: number, ease_func: ease_t) {
  count = clamp(count, 1, 25);
  const total_action_count = count * 4;
  const action_duration = duration / total_action_count;

  const tweenies: tween_action[] = [];
  for (let i = 0; i < count; i++) {
    tweenies.push(action_creator(tr, force, action_duration, sentinel, ease_func));
    tweenies.push(action_creator(tr, value_mul(force, -1), action_duration, sentinel, ease_func));
    tweenies.push(action_creator(tr, value_mul(force, -1), action_duration, sentinel, ease_func));
    tweenies.push(action_creator(tr, force, action_duration, sentinel, ease_func));
    force = value_mul(force, 0.75);
  }

  return sequence(tweenies);
}

function rotate_by_impl(creator_name: string, tr: transformf, amount: vec3, func: (tr: transformf, amount: vec3) => void,
  getter_func: (tr: transformf) => vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t) {
  const creator = () => {
    const initialize_func = (_tr: transformf, _sentinel: sentinel_t, self: tween_action) => {
      const out = vec3(0);
      inspector.update_begin_value(self, out);
      return out;
    };
    let prev = vec3(0);
    const updater_func = (object: transformf, next: vec3, self: tween_action) => {
      const delta = value_sub(next, prev);
      func(object, delta);
      inspector.update_tween_status(self, getter_func(object));
      prev = next;
    };
    const getter = (object: transformf) => getter_func(object);
    return create_tween_updater(tr, amount, sentinel, initialize_func, updater_func, getter, ease_func);
  };
  const action = new tween_action(creator, duration, sentinel);
  inspector.add_info(action, creator_name, tr, amount, ease_func);
  return action;
}

const set_position = (obj: transformf, arg: vec3) => obj.set_position(arg);
const get_position = (obj: transformf) => obj.get_position();
const set_scale = (obj: transformf, arg: vec3) => obj.set_scale(arg);
const get_scale = (obj: transformf) => obj.get_scale();
const set_rotation_euler = (obj: transformf, arg: vec3) => obj.set_rotation_euler(arg);
const get_rotation_euler = (obj: transformf) => obj.get_rotation_euler();

// TRANSLATION

export function move_from_to(tr: transformf, begin: vec3, end: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('move_from_to', tr, begin, end, set_position, get_position, duration, sentinel, ease_func);
}

export function move_to(tr: transformf, end: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('move_to', tr, end, set_position, get_position, duration, sentinel, ease_func);
}

export function move_by(tr: transformf, amount: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('move_by', tr, amount, set_position, get_position, duration, sentinel, ease_func);
}

export function shake(tr: transformf, force: vec3, duration: duration_t, sentinel: sentinel_t, shake_count = 6, ease_func: ease_t = ease.linear) {
  return shake_impl(tr, force, move_by, duration, sentinel, shake_count, ease_func);
}

// SCALE

export function scale_from_to(tr: transformf, begin: vec3, end: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('scale_from_to', tr, begin, end, set_scale, get_scale, duration, sentinel, ease_func);
}

export function scale_to(tr: transformf, end: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('scale_to', tr, end, set_scale, get_scale, duration, sentinel, ease_func);
}

export function scale_by(tr: transformf, amount: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_by_impl('scale_by', tr, amount, set_scale, get_scale, duration, sentinel, ease_func);
}

export function pulse(tr: transformf, sentinel: sentinel_t, duration: duration_t = 750, factor = 0.1, ease_func: ease_t = ease.linear) {
  const strength = vec3(factor, factor, 0.0);
  const duration2 = duration / 2;
  return sequence(scale_by(tr, strength, duration2, sentinel, ease_func), scale_by(tr, value_mul(strength, -1), duration2, sentinel, ease_func));
}

// ROTATION

export function rotate_from_to(tr: transformf, begin: vec3, end: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_from_to_impl('rotate_from_to', tr, begin, end, set_rotation_euler, get_rotation_euler, duration, sentinel, ease_func);
}

export function rotate_to(tr: transformf, end: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return create_tween_to_impl('rotate_to', tr, end, set_rotation_euler, get_rotation_euler, duration, sentinel, ease_func);
}

export function rotate_by(tr: transformf, amount: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return rotate_by_impl('rotate_by', tr, amount, (obj, delta) => obj.rotate_local(delta), get_rotation_euler, duration, sentinel, ease_func);
}

export function rotate_by_global(tr: transformf, amount: vec3, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t = ease.linear) {
  return rotate_by_impl('rotate_by', tr, amount, (obj, delta) => obj.rotate(delta), get_rotation_euler, duration, sentinel, ease_func);
}

export function dangle(tr: transformf, force: number, duration: duration_t, sentinel: sentinel_t, dangle_count = 6, ease_func: ease_t = ease.linear) {
  const action_creator = (tr: transformf, force: number, duration: duration_t, sentinel: sentinel_t, ease_func: ease_t) =>
    rotate_by(tr, vec3(0, 0, force), duration, sentinel, ease_func);
  return shake_impl(tr, force, action_creator, duration, sentinel, dangle_count, ease_func);
}
