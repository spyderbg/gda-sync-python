// tweeny/tween_common.h: tweeny's types.
//
// A duration is in milliseconds (C++: std::chrono::nanoseconds; the translator writes std::chrono::milliseconds).

import type { sentinel } from '@game/hat_libs/egt_hpp/sentinel';

export type duration_t = number;
export type sentinel_t = sentinel;
export type tween_id_t = number;
export type ease_t = (progress: number) => number;
export type interpolate_t<T> = (start: T, end: T, progress: number, ease_func: ease_t) => T;

export enum state_t {
  running,
  paused,
  finished,
}

/** The scopes a started tween is in: its own, alone (independent) or with those pushed (stacked). C++ converts a string
 * to one, as start(tween, "scope") does here. */
export class tween_scope_policy {
  scope = '';
  policy = tween_scope_policy.policy_t.stacked;

  constructor(scope = '') {
    this.scope = scope;
  }
}

export namespace tween_scope_policy {
  export enum policy_t {
    stacked,
    independent,
  }
}

/** What the tween inspector shows of a tween (filled in debug builds; the browser game always fills it). */
export class tween_inspect_info {
  file_name = '';
  function_name = '';
  line_number = 0;
  column_offset = 0;

  id: tween_id_t = 1;

  speed_multiplier = 1.0;
  stop_when_finished = false;

  state = 'finished';
  modified_type = '';
  updater_type = '';

  elapsed: duration_t = 0;
  duration: duration_t = 0;
  progress = 0;

  current_value = '';
  begin_value = '';
  end_value = '';

  ease_func: ease_t | null = null;

  /** C++ holds them by weak_ptr. */
  children: tween_inspect_info[] = [];
}

/** A reference to a tweened value (C++: T&). ref(object, 'field') is object.field, which the translator writes: a
 * view's own field (a private one too) is ref(this, 'm_field'). */
export interface ref_t<T> {
  get(): T;
  set(value: T): void;
}

export function ref<O extends object, K extends keyof O>(object: O, key: K): ref_t<O[K]>;
export function ref<T>(object: object, key: string): ref_t<T>;
export function ref(object: object, key: string): ref_t<unknown> {
  const fields = object as Record<string, unknown>;
  return {
    get: () => fields[key],
    set: value => {
      fields[key] = value;
    },
  };
}
