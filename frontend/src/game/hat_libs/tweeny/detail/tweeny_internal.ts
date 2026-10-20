// tweeny::detail (tweeny/detail/tweeny_internal.h/.cpp): the manager tweeny's functions use: the global one, or the one
// pushed last.

import { tween_manager } from '../tween_manager';

const global_manager = new tween_manager();
const manager_stack: tween_manager[] = [];

export function get_manager(): tween_manager {
  return manager_stack.length ? manager_stack[manager_stack.length - 1] : global_manager;
}

export function push(mgr: tween_manager) {
  manager_stack.push(mgr);
}

export function pop() {
  manager_stack.pop();
}

/** shutdown's `get_manager() = {}`: the manager in use, made as new. */
export function reset_manager() {
  Object.assign(get_manager(), new tween_manager());
}
