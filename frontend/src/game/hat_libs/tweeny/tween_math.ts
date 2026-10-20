// tweeny's math (tweeny/tween_math.h/.hpp/.cpp): lerp and range_map of any tweened value, and the helpers of easing.
//
// C++ tweens any T with the operators * and +. The browser's values are numbers or objects of numbers (a point, a
// color, a vec3): value_add, value_sub, value_mul and value_equal are what those operators do on them.

import type { ease_t } from './tween_common';
import { linear } from './tween_ease';

type value_t = number | object;

function map_value<T>(a: T, b: T | null, op: (x: number, y: number) => number): T {
  if (typeof a === 'number') return op(a, b as number) as T;
  if (a === null || typeof a !== 'object') return a;
  const out: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(a)) {
    const other = b === null ? null : (b as Record<string, unknown>)[key];
    out[key] = typeof item === 'number' || (item && typeof item === 'object') ? map_value(item, other ?? (typeof item === 'number' ? 0 : null), op) : item;
  }
  return out as T;
}

/** a + b */
export function value_add<T>(a: T, b: T): T {
  return map_value(a, b, (x, y) => x + y);
}

/** a - b */
export function value_sub<T>(a: T, b: T): T {
  return map_value(a, b, (x, y) => x - y);
}

/** a * factor */
export function value_mul<T>(a: T, factor: number): T {
  return map_value(a, null, x => x * factor);
}

/** a == b */
export function value_equal<T>(a: T, b: T): boolean {
  if (typeof a === 'number' || typeof b === 'number') return a === b;
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a as object);
  if (keys.length !== Object.keys(b as object).length) return false;
  return keys.every(key => value_equal((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]));
}

/** T{}: zero of the value's kind. */
export function value_zero<T>(like: T): T {
  return map_value(like, null, () => 0);
}

/** A value between 'start' and 'end', by progress (0 to 1). */
export function lerp<T extends value_t>(start: T, end: T, progress: number, ease_func: ease_t = linear): T {
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  const completion = ease_func(progress);
  return value_add(value_mul(start, 1 - completion), value_mul(end, completion));
}

/** A value between 'out_start' and 'out_end', by where 'in' is between 'in_start' and 'in_end'. */
export function range_map<T extends value_t>(input: number, in_start: number, in_end: number, out_start: T, out_end: T, ease_func: ease_t = linear): T {
  if (input <= in_start) return out_start;
  if (input >= in_end) return out_end;
  const progress = input - in_start;
  const in_factor = progress / (in_end - in_start);
  return lerp(out_start, out_end, in_factor, ease_func);
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

export function square(x: number, n: number) {
  for (let i = 0; i < n; i++) x *= x;
  return x;
}

export function flip(x: number) {
  return 1 - x;
}

export function mix(a: number, b: number, weight: number, t: number) {
  const mixed = (1 - weight) * a + (1 - weight) * b;
  return mixed * t;
}

export function crossfade(a: number, b: number, t: number) {
  return (1 - t) * a + t * b;
}

export function scale(a: number, t: number) {
  return a * t;
}

export function reverse_scale(a: number, t: number) {
  return a * (1 - t);
}

export function arch(t: number) {
  return t * (1 - t);
}
