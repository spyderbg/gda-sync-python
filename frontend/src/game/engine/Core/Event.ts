// Egt::Core::Event and Egt::Core::EventQueue.
//
// An event is posted by its owner (a view, the gameflow) and delivered to the callbacks registered for it: a queued
// callback runs when its queue is executed (the state machine executes its queue every frame, like Machine::Process),
// an instant one runs during Post.
//
// A callback is registered with its owner, C++'s sentinel (a weak pointer to what the callback belongs to). An owner that
// is a Sentinel expires as C++'s does when its owner is destroyed: a queued callback whose sentinel expired before its
// queue ran it does not run, and an expired sentinel's registration goes at the next Post. Unregistering
// (ForceUnregister) does not cancel the callbacks already queued, as in C++. Any other owner never expires.

export type Callback<A extends unknown[]> = (...args: A) => void;

/** Egt's Sentinel, the life of what a callback belongs to: the state machine's per-event sentinel, which expires when
 * the last state that reacts on the event is destroyed. */
export class Sentinel {
  private m_expired = false;

  /** What C++ does when the last shared pointer to it goes. */
  Expire() {
    this.m_expired = true;
  }

  IsExpired() {
    return this.m_expired;
  }
}

function IsExpired(owner: object) {
  return owner instanceof Sentinel && owner.IsExpired();
}

export class EventQueue {
  private callbacks: (() => void)[] = [];

  AddCallback(callback: () => void) {
    this.callbacks.push(callback);
  }

  /** Runs the callbacks queued so far and those they queue, and returns how many ran. */
  ExecuteAllCallbacks(limit = 10_000): number {
    let count = 0;
    while (this.callbacks.length && count < limit) {
      this.callbacks.shift()!();
      count++;
    }
    return count;
  }

  IsEmpty() {
    return this.callbacks.length === 0;
  }

  Clear() {
    this.callbacks = [];
  }
}

interface Registration<A extends unknown[]> {
  owner: object;
  queue: EventQueue | null;
  callback: Callback<A>;
}

export class Event<A extends unknown[] = []> {
  private registrations: Registration<A>[] = [];

  /** Registers a callback that runs when queue executes, after each Post. */
  Register(queue: EventQueue, owner: object, callback: Callback<A>) {
    if (IsExpired(owner)) throw new Error('expired handler sentinel');
    this.registrations.push({ owner, queue, callback });
  }

  /** Registers a callback that runs during Post. */
  RegisterInstant(owner: object, callback: Callback<A>) {
    if (IsExpired(owner)) throw new Error('expired handler sentinel');
    this.registrations.push({ owner, queue: null, callback });
  }

  Unregister(owner: object) {
    this.registrations = this.registrations.filter(registration => registration.owner !== owner);
  }

  /** C++'s ForceUnregister(sentinel): the owner's callbacks go, as Unregister's do. */
  ForceUnregister(owner: object) {
    this.Unregister(owner);
  }

  IsRegistered(owner: object) {
    return !IsExpired(owner) && this.registrations.some(registration => registration.owner === owner);
  }

  Post(...args: A) {
    for (const registration of [...this.registrations]) {
      const { owner, queue, callback } = registration;
      if (IsExpired(owner)) {
        this.registrations = this.registrations.filter(item => item !== registration);
        continue;
      }
      if (queue) {
        queue.AddCallback(() => {
          if (!IsExpired(owner)) callback(...args);
        });
      } else {
        callback(...args);
      }
    }
  }
}
