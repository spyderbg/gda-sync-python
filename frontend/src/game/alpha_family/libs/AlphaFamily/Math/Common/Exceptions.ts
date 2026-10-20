// Egt::Game::AlphaFamily RoundInputError and RoundConfigError (AlphaFamily/Math/Common/Exceptions.h).

export class RoundInputError extends Error {
  constructor(message: string, readonly data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RoundInputError';
  }
}

export class RoundConfigError extends Error {
  constructor(message: string, readonly data: Record<string, unknown> = {}) {
    super(message);
    this.name = 'RoundConfigError';
  }
}
