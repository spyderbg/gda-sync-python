// tweeny::inspector (tweeny/tween_inspector.h/.cpp, and to_str/type_to_str of tween_common.h): what the tween inspector
// shows of the tweens. C++ fills it in debug builds (EGT_DEBUG); the browser game always does.

import { type ease_t, state_t, tween_inspect_info } from './tween_common';
import type { tween_action } from './tween_action';
import { tween_private } from './tween_private';

export function to_str(value: unknown): string {
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function type_to_str(value: unknown): string {
  if (typeof value === 'number') return 'float';
  if (value && typeof value === 'object' && 'type_name' in value && typeof value.type_name === 'string') return value.type_name;
  return 'unsupported';
}

function state_to_str(state: state_t) {
  if (state === state_t.running) return 'running';
  if (state === state_t.paused) return 'paused';
  return 'finished';
}

export function update_begin_value(action: tween_action, begin: unknown) {
  if (action.info) action.info.begin_value = to_str(begin);
}

/** update_tween_status(action, current), or update_tween_status(action): one of no value. */
export function update_tween_status(action: tween_action, ...current: [unknown?]) {
  const info = action.info;
  if (!info) return;
  info.current_value = current.length ? to_str(current[0]) : 'n/a';
  info.elapsed = tween_private.get_elapsed(action);
  info.progress = info.duration > 0 ? info.elapsed / info.duration : 0;
  info.speed_multiplier = tween_private.get_speed_multiplier(action);
  info.stop_when_finished = tween_private.is_stop_when_finished_requested(action);
}

export function add_info(action: tween_action, updater_type: string, object: unknown, end_value: unknown, ease_func: ease_t) {
  action.info = new tween_inspect_info();
  action.info.id = action.get_id();
  action.info.duration = tween_private.get_duration(action);
  action.info.updater_type = updater_type;
  action.info.modified_type = type_to_str(object);
  action.info.end_value = to_str(end_value);
  action.info.ease_func = ease_func;
}

function add_children(info: tween_inspect_info, tweenies: readonly tween_action[]) {
  for (const tween of tweenies) if (tween.info) info.children.push(tween.info);
}

export function add_sequence_info(action: tween_action, tweenies: readonly tween_action[]) {
  const info = new tween_inspect_info();
  info.id = action.get_id();
  info.updater_type = 'sequence';
  info.modified_type = 'tween_action';
  info.begin_value = '0';
  info.current_value = '0';
  info.end_value = to_str(tweenies.length);
  info.duration = tween_private.get_duration(action);
  add_children(info, tweenies);
  action.info = info;
}

export function add_together_info(action: tween_action, tweenies: readonly tween_action[]) {
  const info = new tween_inspect_info();
  info.id = action.get_id();
  info.updater_type = 'together';
  info.modified_type = 'tween_action';
  info.begin_value = 'n/a';
  info.current_value = 'n/a';
  info.end_value = 'n/a';
  info.duration = tween_private.get_duration(action);
  add_children(info, tweenies);
  action.info = info;
}

export function add_delay_info(action: tween_action) {
  const info = new tween_inspect_info();
  info.id = action.get_id();
  info.updater_type = 'delay';
  info.modified_type = 'n/a';
  info.begin_value = 'n/a';
  info.current_value = 'n/a';
  info.end_value = 'n/a';
  info.duration = tween_private.get_duration(action);
  action.info = info;
}

export function add_repeat_info(repeat_action: tween_action, action: tween_action, times = 0) {
  const info = new tween_inspect_info();
  info.id = repeat_action.get_id();
  info.updater_type = 'repeat';
  if (times === 0) {
    info.begin_value = 'infinity';
    info.current_value = 'infinity';
    info.end_value = 'infinity';
    info.duration = 0;
  } else {
    info.begin_value = '0';
    info.current_value = '0';
    info.end_value = String(times);
    info.duration = tween_private.get_duration(repeat_action) * times;
  }
  if (action.info) info.children.push(action.info);
  repeat_action.info = info;
}

export function update_tween_state(action: tween_action, state: state_t) {
  if (action.info) action.info.state = state_to_str(state);
}

/** The source location of tweeny::start: the browser's has none but the function's name it is given. */
export interface source_location {
  file_name?: string;
  function_name?: string;
  line?: number;
  column?: number;
}

export function add_location(action: tween_action, location: source_location) {
  if (!action.info) return;
  action.info.file_name = location.file_name ?? '';
  action.info.function_name = location.function_name ?? '';
  action.info.line_number = location.line ?? 0;
  action.info.column_offset = location.column ?? 0;
}
