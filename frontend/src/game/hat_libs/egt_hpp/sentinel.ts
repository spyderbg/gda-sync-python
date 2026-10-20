// hpp::sentinel (hat_libs/egt_hpp/sentinel.hpp): whether what a tween or a slot works on is gone. C++ makes one from a
// shared_ptr (expired once the pointer is released) or a predicate; a default sentinel is expired.
//
// The browser has no shared_ptr: a sentinel is made from a predicate, or from anything with expired() (another
// sentinel, a view element, which its elements list releases).

export interface expirable {
  expired(): boolean;
}

export class sentinel implements expirable {
  predicate_: (() => boolean) | null;

  constructor(predicate: (() => boolean) | expirable | null = null) {
    if (predicate && typeof predicate === 'object') {
      const source = predicate;
      this.predicate_ = () => source.expired();
    } else {
      this.predicate_ = predicate;
    }
  }

  expired() {
    if (this.predicate_) return this.predicate_();
    return true;
  }
}

/** A sentinel that expires when any of the given ones does; of none, one that never expires. */
export function make_sentinel(...args: expirable[]) {
  const expiration_check_functions = args.map(sent => () => sent.expired());
  const sent = new sentinel();
  sent.predicate_ = () => expiration_check_functions.some(is_expired_fn => is_expired_fn());
  return sent;
}

const eternal = new sentinel(() => false);

export function eternal_sentinel() {
  return eternal;
}
