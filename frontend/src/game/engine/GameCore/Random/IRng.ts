// Egt::GameCore::IRng (IRng.h, IRng.data.h) and the engines the game uses: MonteCarloEngine (the kernel's random
// numbers), MonteCarloEngineHat (a seeded, deterministic engine for visual diversity), HistoryEngine (records every
// number for the round's replay), ReplayEngine (plays a recorded sequence back), and the RNG tools' OverrideEngine
// and MementoEngine (Random/Adaptor: numbers forced by operation, recorded).

export enum RngOp {
  // Don't use Undefined in IRng::Generate calls
  Undefined = 0,
  CompatibilityDiscard = 1,

  // Math (affects RTP)
  ShuffleArray = 2,
  RtpReducer = 3,
  LeftoverBet = 4,
  DrawCard = 5,
  SelectReel = 6,
  SelectReels = 7,
  StopReels = 8,
  StopWheel = 9,
  WildPos = 10,
  CoinType = 11,
  CoinNew = 12,
  CoinPos = 13,
  CoinVal = 14,
  CoinCount = 15,
  RareNew = 16,
  RarePos = 17,
  SpecialType = 18,
  SpecialNew = 19,
  SpecialPos = 20,
  SpecialCount = 21,
  CollectorPos = 22,
  CollectorType = 23,
  CollectorPlusAmount = 24,
  CollectorMultAmount = 25,
  BonusType = 26,
  JackpotTrigger = 27,
  JackpotWinLevel = 28,
  JackpotMajor = 29,
  DropJpSymbol = 30,
  SelectJpDistr = 31,
  SelectJpSymbol = 32,
  SelectEmptyPos = 33,
  SelectSymbol = 34,
  SelectSpecialSymbol = 35,
  SelectLowMidHigh = 36,
  SelectOutCoins = 37,
  SelectMaxCount = 38,
  SelectMult = 39,
  SelectDistr = 40,
  SelectCounter = 41,
  MysterySelectWin = 42,
  MysterySelectMult = 43,
  MysterySelectScreen = 44,
  MysterySelectDrop = 45,
  MysterySelectPosition = 46,
  AxeCount = 47,
  MultiReel = 48,
  StickSymbol = 49,
  StickWild = 50,
  StickScatter = 51,
  StackSymbol = 52,
  StackScatter = 53,
  RespinWinCount = 54,
  RespinBlankCount = 55,
  IgniteCoin = 56,
  IgniteNew = 57,
  IgniteVal = 58,
  ForceIgnite = 59,
  MultiplyCoin = 60,
  MultiplierNew = 61,
  MultiplierVal = 62,
  ForceMultiplier = 63,
  DrawBall = 64,
  DrawScreenBall = 65,
  RoundBet = 66,

  // Visual Diversity (Deterministic)
  // - Does not affect RTP or any Math metric.
  // - Produces the exact same outcome when a match is replayed from backup.
  VisualDiversity_Begin = 1000,
  VisualDiversitySeed = 1001,
  ZeroRoundSeed = 1002,
  PhaseAnimation = 1003,
  HoldAndSpinNoCoinDrop = 1004,
  VisualDiversity_End = 1999,

  // Debug/Test
  DebugTest_Begin = 2000,
  UnitTest = 2001,
  SimulateRemoteServer = 2002,
  DebugTest_End = 2999,

  // skip ReplayEngine checks for this RngOp
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

/** Egt::GameCore::RngOverrideData (Random/Engine/IRngEngine.data.h): the numbers to force, queued by their operation. */
export class RngOverrideData {
  readonly queues = new Map<RngOp, number[]>();

  /** C++'s operator+=: another override's queues, or a sequence's numbers, each after its operation's queue. */
  Append(rhs: RngOverrideData | RngSequence) {
    if (rhs instanceof RngOverrideData) {
      for (const [op, rhsQueue] of [...rhs.queues]) this.Queue(op).push(...rhsQueue);
    } else {
      for (const generate of rhs.data) this.Queue(generate.op).push(generate.value);
    }
    return this;
  }

  private Queue(op: RngOp) {
    let queue = this.queues.get(op);
    if (!queue) this.queues.set(op, (queue = []));
    return queue;
  }
}

/** Egt::GameCore::OverrideEngine (Random/Adaptor/OverrideEngine.h): an operation's forced number while it has one, its
 * engine's otherwise. A forced number is returned as it is, whatever the range asked. */
export class OverrideEngine<T extends IRng = IRng> implements IRng {
  private m_override = new RngOverrideData();

  constructor(readonly engine: T) {}

  Generate(op: RngOp, range = 0) {
    const rigged = this.PopRigged(op);
    return rigged !== undefined ? rigged : this.engine.Generate(op, range);
  }

  GetHistory(): RngSequence {
    return this.engine.GetHistory();
  }

  SetOverride(data: RngOverrideData) {
    this.m_override = data;
  }

  GetOverride() {
    return this.m_override;
  }

  PushOverride(data: RngOverrideData | RngSequence) {
    this.m_override.Append(data);
  }

  ClearOverride() {
    this.m_override.queues.clear();
  }

  private PopRigged(op: RngOp): number | undefined {
    const numbers = this.m_override.queues.get(op);
    if (!numbers?.length) return undefined;
    return numbers.shift();
  }
}

/** Egt::GameCore::MementoEngine<Engine> (Random/Adaptor/MementoEngine.h): HistoryEngine<OverrideEngine<Engine>>, the
 * forced numbers and the engine's, recorded. */
export class MementoEngine<T extends IRng = IRng> extends HistoryEngine<OverrideEngine<T>> {
  constructor(engine: T) {
    super(new OverrideEngine(engine));
  }

  SetOverride(data: RngOverrideData) {
    this.engine.SetOverride(data);
  }

  GetOverride() {
    return this.engine.GetOverride();
  }

  PushOverride(data: RngOverrideData | RngSequence) {
    this.engine.PushOverride(data);
  }

  ClearOverride() {
    this.engine.ClearOverride();
  }
}
