// tweeny::tween_manager (tweeny/tween_manager.h/.cpp): runs the started tweens, by their ids, and their scopes. A tween
// is started in the scopes pushed, and its scope policy's; a scope's tweens stop, pause and resume together.

import { type duration_t, tween_scope_policy, type tween_id_t } from './tween_common';
import { id_of, tween_action } from './tween_action';
import { tween_private } from './tween_private';
import { state_t } from './tween_common';

const NINETY_NINE_HOURS: duration_t = 99 * 3_600_000;

export class tween_info {
  tween = new tween_action();
  depth = 0;
  scopes: string[] = [];
}

/** C++'s std::map: by id, in id order. */
export type tween_collection = Map<tween_id_t, tween_info>;

type tween_ref = tween_id_t | tween_action;

export class tween_manager {
  private scopes_: string[] = [];
  private current_scope_idx_ = -1;
  /** C++'s std::set of (scope, key): kept sorted. */
  private paused_scopes_: [string, string][] = [];
  private tweenies_: tween_collection = new Map();
  private pending_tweenies_: tween_collection = new Map();

  start(tween: tween_action, scope_policy: tween_scope_policy = new tween_scope_policy()): tween_id_t {
    const id = tween.get_id();

    if (this.is_running(tween)) return id;

    if (this.is_paused(tween)) {
      this.resume(tween);
      return id;
    }

    const fill_info = (info: tween_info, tween: tween_action) => {
      info.tween = tween;
      if (!scope_policy.scope) {
        info.scopes.push(...this.scopes_);
      } else if (scope_policy.policy === tween_scope_policy.policy_t.independent) {
        info.scopes.push(scope_policy.scope);
      } else if (scope_policy.policy === tween_scope_policy.policy_t.stacked) {
        info.scopes.push(...this.scopes_);
        info.scopes.push(scope_policy.scope);
      }
    };

    if (!this.tweenies_.has(id)) {
      const info = new tween_info();
      this.tweenies_.set(id, info);
      fill_info(info, tween);
      this.start_tweeny(info);
    } else {
      // Occurs when start yourself from your own callback or start yourself from previous tween process
      const info = new tween_info();
      this.pending_tweenies_.set(id, info);
      fill_info(info, tween);
    }

    return id;
  }

  stop(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    if (info) tween_private.stop(info.tween);
    this.pending_tweenies_.delete(id_of(id));
  }

  stop_all(scope = '') {
    for (const info of this.in_scope(scope)) tween_private.stop(info.tween);
  }

  pause(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    if (info) tween_private.pause(info.tween);
  }

  pause_all(scope = '', key = '') {
    this.insert_paused_scope(scope, key);
    for (const info of this.in_scope(scope)) tween_private.pause(info.tween, key);
  }

  resume(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    if (info) tween_private.resume(info.tween);
  }

  resume_all(scope = '', key = '') {
    this.paused_scopes_ = this.paused_scopes_.filter(([s, k]) => s !== scope || k !== key);
    for (const info of this.in_scope(scope)) tween_private.resume(info.tween, key);
  }

  stop_when_finished(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    if (info) tween_private.stop_when_finished(info.tween);
  }

  stop_when_finished_all(scope = '') {
    for (const info of this.in_scope(scope)) tween_private.stop_when_finished(info.tween);
  }

  stop_and_finish(id: tween_ref, _finish_after: duration_t = 0) {
    const info = this.tweenies_.get(id_of(id));
    if (!info) return;
    const tween = info.tween;

    if (tween_private.get_state(tween) === state_t.finished) return;

    if (info.depth > 0) {
      this.stop(tween);
      throw new Error('Cannot call stop_and_finish from callbacks.');
    }

    tween_private.stop_and_finished(tween);
    tween_private.stop_when_finished(tween);
    for (;;) {
      const force = true;
      tween_private.resume(tween, force);

      ++info.depth;
      let finished: boolean;
      try {
        finished = state_t.finished === tween_private.update(tween, NINETY_NINE_HOURS);
      } finally {
        --info.depth;
      }

      if (finished) break;
    }
  }

  stop_and_finish_all(scope = '') {
    for (const info of this.in_scope(scope)) this.stop_and_finish(info.tween);
  }

  is_stopping(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.is_stop_when_finished_requested(info.tween) : false;
  }

  is_running(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.is_running(info.tween) : false;
  }

  is_paused(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.is_paused(info.tween) : false;
  }

  is_finished(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.is_finished(info.tween) : true;
  }

  has_tween_with_scope(scope_id: string) {
    return this.in_scope(scope_id).length > 0;
  }

  get_tween_count_in_scope(scope_id: string) {
    return this.in_scope(scope_id).length;
  }

  set_speed_multiplier(id: tween_ref, speed_multiplier = 1.0) {
    const info = this.tweenies_.get(id_of(id));
    if (info) tween_private.set_speed_multiplier(info.tween, speed_multiplier);
  }

  get_speed_multiplier(id: tween_ref) {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.get_speed_multiplier(info.tween) : 1.0;
  }

  get_elapsed(id: tween_ref): duration_t {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.get_elapsed(info.tween) : 0;
  }

  get_duration(id: tween_ref): duration_t {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.get_duration(info.tween) : 0;
  }

  get_remaining(id: tween_ref): duration_t {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.get_remaining(info.tween) : 0;
  }

  get_overflow(id: tween_ref): duration_t {
    const info = this.tweenies_.get(id_of(id));
    return info ? tween_private.get_overflow(info.tween) : 0;
  }

  /** update(delta): runs every tween; update(id, delta): the one of the id. */
  update(id_or_delta: tween_ref | duration_t, delta?: duration_t) {
    if (delta !== undefined) {
      const info = this.tweenies_.get(id_of(id_or_delta as tween_ref));
      if (info) tween_private.update(info.tween, delta);
      return;
    }
    this.update_all(id_or_delta as duration_t);
  }

  /** Dangerous function, proceed with caution! */
  set_elapsed(id: tween_ref, elapsed: duration_t) {
    const info = this.tweenies_.get(id_of(id));
    if (!info) return;
    tween_private.set_elapsed(info.tween, elapsed);
  }

  push_scope(scope: string) {
    if (!scope) return;
    if (this.scopes_.includes(scope)) throw new Error('push_scope that is already pushed.');
    this.scopes_.push(scope);
    this.current_scope_idx_ = this.scopes_.length - 1;
  }

  pop_scope() {
    if (this.current_scope_idx_ < this.scopes_.length) {
      // C++'s scopes_.at(-1) throws std::out_of_range
      if (this.current_scope_idx_ < 0) throw new RangeError('pop_scope: no scope is pushed.');
      this.close_scope(this.scopes_[this.current_scope_idx_]);
    }
  }

  close_scope(scope: string) {
    const scope_copy = scope;
    const index = this.scopes_.indexOf(scope_copy);
    if (index >= 0) this.scopes_.splice(index);
    this.paused_scopes_ = this.paused_scopes_.filter(([s]) => s !== scope_copy);
    this.current_scope_idx_ = this.scopes_.length - 1;
  }

  clear_scopes() {
    this.scopes_ = [];
    this.current_scope_idx_ = -1;
  }

  get_current_scope() {
    if (!this.scopes_.length) return '';
    return this.scopes_[this.current_scope_idx_];
  }

  get_scopes(): readonly string[] {
    return this.scopes_;
  }

  get_tweenies(): ReadonlyMap<tween_id_t, tween_info> {
    return this.tweenies_;
  }

  private update_all(delta: duration_t) {
    if (delta < 0) delta = 0;

    const tweenies_to_start: tween_id_t[] = [];
    for (const [id, info] of this.pending_tweenies_) {
      tweenies_to_start.push(id);
      this.tweenies_.set(id, info);
    }
    this.pending_tweenies_.clear();

    for (const id of tweenies_to_start) this.start_tweeny(this.tweenies_.get(id)!);

    for (const id of this.get_ids()) {
      const tween = this.tweenies_.get(id);
      // C++'s tweenies_[id] makes an empty entry of an id a callback erased: it finishes at once
      if (!tween) continue;

      if (tween.depth > 0) continue;

      tween.depth++;
      let state: state_t;
      try {
        state = tween_private.update(tween.tween, delta);
      } finally {
        tween.depth--;
      }

      if (state === state_t.finished) this.tweenies_.delete(tween.tween.get_id());
    }
  }

  private start_tweeny(tween_info: tween_info) {
    const tween = tween_info.tween;

    let paused_by_scope = false;
    // First force pause the tweeny before it was started
    for (const scope of tween_info.scopes) {
      const found = this.paused_scopes_.find(([s]) => s === scope);
      if (found) {
        const scope_pause_key = found[1];
        tween_private.pause_forced(tween, scope_pause_key);
        paused_by_scope = true;
        break;
      }
    }

    tween_private.start(tween);

    if (paused_by_scope) tween_private.pause_forced(tween);
  }

  private get_ids() {
    return [...this.tweenies_.keys()].sort((a, b) => a - b);
  }

  private in_scope(scope: string) {
    return [...this.get_ids()].map(id => this.tweenies_.get(id)!).filter(info => info.scopes.includes(scope));
  }

  private insert_paused_scope(scope: string, key: string) {
    if (this.paused_scopes_.some(([s, k]) => s === scope && k === key)) return;
    this.paused_scopes_.push([scope, key]);
    this.paused_scopes_.sort(([s1, k1], [s2, k2]) => (s1 < s2 ? -1 : s1 > s2 ? 1 : k1 < k2 ? -1 : k1 > k2 ? 1 : 0));
  }
}
