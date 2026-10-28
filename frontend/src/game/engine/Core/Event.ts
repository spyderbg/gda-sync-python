// Egt::Core::Event and Egt::Core::EventQueue.
//
// An event is posted by its owner (a view, the gameflow) and delivered to the callbacks registered for it: a queued
// callback runs when its queue is executed (the state machine executes its queue every frame, like Machine::Process),
// an instant one runs during Post.

export type Callback<A extends unknown[]> = (...args: A) => void;

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
    this.registrations.push({ owner, queue, callback });
  }

  /** Registers a callback that runs during Post. */
  RegisterInstant(owner: object, callback: Callback<A>) {
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
    return this.registrations.some(registration => registration.owner === owner);
  }

  Post(...args: A) {
    for (const { queue, callback } of [...this.registrations]) {
      if (queue) queue.AddCallback(() => callback(...args));
      else callback(...args);
    }
  }
}
