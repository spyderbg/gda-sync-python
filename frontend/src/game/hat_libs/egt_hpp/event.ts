// hpp::event (hat_libs/egt_hpp/event.hpp): the slots connected to it run when it is emitted, in the order they were
// connected. A slot disconnected while the event emits is skipped; one connected with connect_once is disconnected after
// it runs. Copying an event copies its slots (tweeny copies its actions, events included).
//
// The browser's has no slot priorities, no source locations and no duplication checks.

import type { expirable } from './sentinel';

export type slot_key = number;

interface slot_t<A extends unknown[]> {
  key: slot_key;
  slot: (...args: A) => void;
  sentinel: expirable | null;
  removed: boolean;
  once: boolean;
}

export class event<A extends unknown[] = []> {
  private slots_: slot_t<A>[] = [];
  private free_id_ = 1;
  private depth_ = 0;
  private current_id_: slot_key = 0;

  /** connect(f), or connect(sentinel, f): the slot is disconnected once the sentinel expires. */
  connect(f: (...args: A) => void): slot_key;
  connect(sentinel: expirable, f: (...args: A) => void): slot_key;
  connect(first: expirable | ((...args: A) => void), second?: (...args: A) => void): slot_key {
    return typeof first === 'function' ? this.connect_impl(false, null, first) : this.connect_impl(false, first, second!);
  }

  /** Connects a slot that is disconnected after it runs once. */
  connect_once(f: (...args: A) => void): slot_key;
  connect_once(sentinel: expirable, f: (...args: A) => void): slot_key;
  connect_once(first: expirable | ((...args: A) => void), second?: (...args: A) => void): slot_key {
    return typeof first === 'function' ? this.connect_impl(true, null, first) : this.connect_impl(true, first, second!);
  }

  /** Disconnects the slot of a key, or the slots of a function. */
  disconnect(key: slot_key | ((...args: A) => void)) {
    const index = this.slots_.findIndex(slot => (typeof key === 'number' ? slot.key === key : slot.slot === key));
    if (index < 0) return;
    if (this.depth_ === 0) this.slots_.splice(index, 1);
    else this.slots_[index].removed = true;
  }

  /** Disconnects the slot that is running. */
  disconnect_current() {
    this.disconnect(this.current_id_);
  }

  emit(...args: A) {
    let collect_garbage = false;
    this.depth_++;
    try {
      // slots connected while emitting run too, as C++ visits them
      for (let i = 0; i < this.slots_.length; i++) {
        const slot = this.slots_[i];
        this.current_id_ = slot.key;
        if (slot.removed || slot.sentinel?.expired()) {
          slot.removed = true;
          collect_garbage = true;
          continue;
        }
        slot.slot(...args);
        if (slot.once) {
          slot.removed = true;
          collect_garbage = true;
        }
      }
    } finally {
      this.depth_--;
      if (collect_garbage && this.depth_ === 0) this.slots_ = this.slots_.filter(slot => !slot.removed);
    }
  }

  empty() {
    return this.slots_.every(slot => slot.removed);
  }

  /** The C++ copy constructor: the same slots, disconnected separately. */
  copy() {
    const copy = new event<A>();
    copy.slots_ = this.slots_.filter(slot => !slot.removed).map(slot => ({ ...slot }));
    copy.free_id_ = this.free_id_;
    return copy;
  }

  private connect_impl(once: boolean, sentinel: expirable | null, f: (...args: A) => void) {
    const id = this.free_id_++;
    this.slots_.push({ key: id, slot: f, sentinel, removed: false, once });
    return id;
  }
}
