// Egt::GameCore's random exceptions (game_core Random/Exceptions.h).

/** A BitQueue was asked for more bits than it holds: the round asks the kernel for more numbers and is retried. */
export class InsufficientRandomBits extends Error {
  constructor(message = 'InsufficientRandomBits') {
    super(message);
    this.name = 'InsufficientRandomBits';
  }
}

/** A ReplayEngine was asked for a number its sequence does not have: none left, or not the operation, range or value
 * it recorded. */
export class RngMismatch extends Error {
  constructor(message = 'RngMismatch') {
    super(message);
    this.name = 'RngMismatch';
  }
}
