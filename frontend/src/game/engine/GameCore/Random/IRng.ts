// Egt::GameCore::IRng (IRng.h, IRng.data.h) and the engines the game uses: MonteCarloEngine (the kernel's random
// numbers), MonteCarloEngineHat (a seeded, deterministic engine for visual diversity), HistoryEngine (records every
// number for the round's replay) and ReplayEngine (plays a recorded sequence back).

export enum RngOp {
  Undefined = 0,
  CompatibilityDiscard = 1,
  ShuffleArray = 2,
  RtpReducer = 3,
  LeftoverBet = 4,
  DrawCard = 5,
  SelectReel = 6,
  SelectReels = 7,
  StopReels = 8,
  StopWheel = 9,
  WildPos = 10,
  StickSymbol = 49,
  StickWild = 50,
  RoundBet = 66,
  VisualDiversity_Begin = 1000,
  VisualDiversitySeed = 1001,
  ZeroRoundSeed = 1002,
  PhaseAnimation = 1003,
  VisualDiversity_End = 1999,
  ReplayNoCheck = 3000,
}

export interface RngNumber {
  op: RngOp;
  range: number;
  value: number;
}

export type RngNumbers = number[];

export interface RngSequence {
  data: RngNumber[];
}

export interface IRng {
  /** A random number uniformly distributed in [0, range), or in [0, 2^32) when range is 0 or left out. */
  Generate(op: RngOp, range?: number): number;
  GetHistory(): RngSequence;
}

const UINT32 = 0x1_0000_0000;

/** A uniform number in [0, range) from a source of uniform 32-bit numbers, rejecting the biased tail. */
function uniform(next: () => number, range: number): number {
  if (!range) return next();
  if (range > UINT32) throw new Error(`Rng range ${range} is larger than 2^32`);
  const limit = UINT32 - (UINT32 % range);
  for (;;) {
    const value = next();
    if (value < limit) return value % range;
  }
}

/** The kernel's random numbers: the browser's cryptographic generator. */
export class MonteCarloEngine implements IRng {
  private buffer = new Uint32Array(256);
  private index = this.buffer.length;

  private next = () => {
    if (this.index >= this.buffer.length) {
      crypto.getRandomValues(this.buffer);
      this.index = 0;
    }
    return this.buffer[this.index++];
  };

  Generate(_op: RngOp, range = 0) {
    return uniform(this.next, range);
  }

  GetHistory(): RngSequence {
    return { data: [] };
  }
}

/** A deterministic engine for visual diversity: the same seed gives the same numbers (sfc32 seeded by splitmix32). */
export class MonteCarloEngineHat implements IRng {
  private state = new Uint32Array(4);

  constructor(seed: number | RngNumbers = 0) {
    this.SetSeed(seed);
  }

  SetSeed(seed: number | RngNumbers) {
    const seeds = typeof seed === 'number' ? [seed] : seed.length ? seed : [0];
    let mix = 0x9e3779b9;
    for (const value of seeds) mix = (mix ^ (value >>> 0)) >>> 0;
    const splitmix = () => {
      mix = (mix + 0x9e3779b9) >>> 0;
      let z = mix;
      z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
      z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
      return (z ^ (z >>> 16)) >>> 0;
    };
    for (let i = 0; i < 4; i++) this.state[i] = splitmix();
  }

  private next = () => {
    const s = this.state;
    const t = (s[0] + s[1] + s[3]) >>> 0;
    s[3] = (s[3] + 1) >>> 0;
    s[0] = s[1] ^ (s[1] >>> 9);
    s[1] = (s[2] + (s[2] << 3)) >>> 0;
    s[2] = ((s[2] << 21) | (s[2] >>> 11)) >>> 0;
    s[2] = (s[2] + t) >>> 0;
    return t;
  };

  Generate(_op: RngOp, range = 0) {
    return uniform(this.next, range);
  }

  GetHistory(): RngSequence {
    return { data: [] };
  }
}

/** Records every number an engine generates, for the round's replay. */
export class HistoryEngine<T extends IRng = IRng> implements IRng {
  private history: RngNumber[] = [];

  constructor(readonly engine: T) {}

  Generate(op: RngOp, range = 0) {
    const value = this.engine.Generate(op, range);
    this.history.push({ op, range, value });
    return value;
  }

  GetHistory(): RngSequence {
    return { data: [...this.history] };
  }

  ClearHistory() {
    this.history = [];
  }
}

/** Plays a recorded sequence back, checking each number against the range it is asked for. */
export class ReplayEngine implements IRng {
  private numbers: RngNumber[] = [];

  SetNumbers(numbers: RngNumber[]) {
    this.numbers = [...numbers];
  }

  IsEmpty() {
    return this.numbers.length === 0;
  }

  Generate(op: RngOp, range = 0) {
    const number = this.numbers.shift();
    if (!number) throw new Error('ReplayEngine has no more numbers');
    if (number.op !== RngOp.ReplayNoCheck && (number.op !== op || number.range !== range)) {
      throw new Error(`ReplayEngine expected ${RngOp[number.op]}(${number.range}), got ${RngOp[op]}(${range})`);
    }
    return number.value;
  }

  GetHistory(): RngSequence {
    return { data: [] };
  }
}
