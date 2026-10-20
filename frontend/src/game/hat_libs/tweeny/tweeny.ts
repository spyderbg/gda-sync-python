// tweeny (hat_libs/tweeny/tweeny.h/.cpp): the tweens of the views. A view makes a tween_action (tween_to, sequence,
// together, delay, repeat...), starts it, and stops, pauses or resumes it by its id (the action itself converts to its
// id). The video manager updates the started tweens every frame (VideoManager::Process, tweeny::update).
//
// Import it as the namespace it is in C++: import * as tweeny from '.../hat_libs/tweeny/tweeny', then tweeny.start(),
// tweeny.ease.back_stop, tweeny.scope.pause_all(). Durations are in milliseconds.

import * as detail from './detail/tweeny_internal';
import { type duration_t, tween_scope_policy, type tween_id_t } from './tween_common';
import type { tween_action } from './tween_action';
import * as inspector from './tween_inspector';
import type { tween_manager } from './tween_manager';

export * from './tween_common';
export * from './tween_action';
export * from './tween_core';
export * from './tween_ex';
export * from './tween_manager';
export * from './tween_math';
export * from './tween_private';
export * from './tween_updater';
export * as ease from './tween_ease';
export * as inspector from './tween_inspector';

type tween_ref = tween_id_t | tween_action;

/** Starts a copy of the tween in the manager (or resumes it, when paused), in its scope policy's scopes (a string is
 * a scope, as C++ converts it); returns its id. The browser's source location is the function name given, if any. */
export function start(tween: tween_action, scope_policy: tween_scope_policy | string = new tween_scope_policy(),
  location: inspector.source_location = {}): tween_id_t {
  const copy = tween.copy();
  inspector.add_location(copy, location);
  return detail.get_manager().start(copy, typeof scope_policy === 'string' ? new tween_scope_policy(scope_policy) : scope_policy);
}

export function stop(id: tween_ref) {
  detail.get_manager().stop(id);
}

export function pause(id: tween_ref) {
  detail.get_manager().pause(id);
}

export function resume(id: tween_ref) {
  detail.get_manager().resume(id);
}

export function stop_when_finished(id: tween_ref) {
  detail.get_manager().stop_when_finished(id);
}

export function stop_and_finish(id: tween_ref, finish_after: duration_t = 0) {
  detail.get_manager().stop_and_finish(id, finish_after);
}

export function is_stopping(id: tween_ref) {
  return detail.get_manager().is_stopping(id);
}

export function is_running(id: tween_ref) {
  return detail.get_manager().is_running(id);
}

export function is_paused(id: tween_ref) {
  return detail.get_manager().is_paused(id);
}

export function is_finished(id: tween_ref) {
  return detail.get_manager().is_finished(id);
}

export function has_tween_with_scope(scope_id: string) {
  return detail.get_manager().has_tween_with_scope(scope_id);
}

export function get_tween_count_in_scope(scope_id: string) {
  return detail.get_manager().get_tween_count_in_scope(scope_id);
}

export function set_speed_multiplier(id: tween_ref, speed_multiplier = 1.0) {
  detail.get_manager().set_speed_multiplier(id, speed_multiplier);
}

export function get_speed_multiplier(id: tween_ref) {
  return detail.get_manager().get_speed_multiplier(id);
}

export function get_elapsed(id: tween_ref): duration_t {
  return detail.get_manager().get_elapsed(id);
}

export function set_elapsed(id: tween_ref, duration: duration_t) {
  detail.get_manager().set_elapsed(id, duration);
}

export function get_duration(id: tween_ref): duration_t {
  return detail.get_manager().get_duration(id);
}

export function get_remaining(id: tween_ref): duration_t {
  return detail.get_manager().get_remaining(id);
}

export function get_overflow(id: tween_ref): duration_t {
  return detail.get_manager().get_overflow(id);
}

/** update(delta): runs every started tween by delta; update(id, delta): the one of the id. */
export function update(id_or_delta: tween_ref | duration_t, delta?: duration_t) {
  detail.get_manager().update(id_or_delta, delta);
}

export function get_percent(id: tween_ref) {
  const dur = get_duration(id);
  if (dur === 0) return 0.0;
  return get_elapsed(id) / dur;
}

/** Stops every tween: the manager is made as new. */
export function shutdown() {
  detail.reset_manager();
}

/** The scopes tweens are started in (tweeny::scope). */
export namespace scope {
  export function push(scope: string) {
    detail.get_manager().push_scope(scope);
  }

  export function pop() {
    detail.get_manager().pop_scope();
  }

  export function close(scope: string) {
    detail.get_manager().close_scope(scope);
  }

  export function clear() {
    detail.get_manager().clear_scopes();
  }

  export function get_current() {
    return detail.get_manager().get_current_scope();
  }

  export function stop_all(scope: string) {
    detail.get_manager().stop_all(scope);
  }

  /** pause_all(scope), or pause_all(scope, key): resume_all with the same key resumes them. */
  export function pause_all(scope: string, key = '') {
    detail.get_manager().pause_all(scope, key);
  }

  export function resume_all(scope: string, key = '') {
    detail.get_manager().resume_all(scope, key);
  }

  export function stop_and_finish_all(scope: string) {
    detail.get_manager().stop_and_finish_all(scope);
  }

  export function stop_when_finished_all(scope: string) {
    detail.get_manager().stop_when_finished_all(scope);
  }
}

/** The managers tweeny's functions use (tweeny::manager): the pushed one, else the global one. */
export namespace manager {
  export function push(mgr: tween_manager) {
    detail.push(mgr);
  }

  export function pop() {
    detail.pop();
  }
}
