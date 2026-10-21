// Egt::Game::AlphaFamily common math types (AlphaFamily/Math/Common/Common.data.h).

import { Currencies, type CurrencyType, GameCurrency } from '@game/engine/Game/Math/Common.data';

export enum RoundType {
  Undefined,
  Main,
  Free,
  Extra,
  ExtraFree,
  HoldAndSpin,
  Wheel,
  Gamble,
  Coins,
  CoinsFree,
  Tetra,
}

export enum RoundErrorCode {
  Undefined,
  InsufficientRandomBits,
  InputError,
  ConfigError,
  Exception,
}

export const Currency = {
  ...GameCurrency,
  MainSpinEnergy: 9,
  ExtraSpinEnergy: 10,
  FreeSpinEnergy: 11,
  ExtraFreeSpinEnergy: 12,
  HoldAndSpinEnergy: 13,
  CoinsSpinEnergy: 14,
  CoinsFreeSpinEnergy: 15,
  GambleToken: 16,
  WheelToken: 17,
  ToString(type: CurrencyType): string {
    const names: Record<number, string> = {
      9: 'MainSpinEnergy', 10: 'ExtraSpinEnergy', 11: 'FreeSpinEnergy', 12: 'ExtraFreeSpinEnergy', 13: 'HoldAndSpinEnergy',
      14: 'CoinsSpinEnergy', 15: 'CoinsFreeSpinEnergy', 16: 'GambleToken', 17: 'WheelToken',
    };
    return names[type] ?? GameCurrency.ToString(type);
  },
} as const;

export enum CombinationType {
  Undefined,
  LeftToRight,
  Scatter,
  Ways,
  HoldAndSpinTrigger,
}

export enum MultiplierType {
  Undefined,
  PayTable,
  Wild,
  ReelRound,
  Ways,
}

export enum ERoundTags {
  Undefined,
  Attraction,
  NearMiss,
  BigWin,
  SuperWin,
  EpicWin,
  MegaWin,
  MiniSymbolPrize,
  MinorSymbolPrize,
  MajorSymbolPrize,
  GrandSymbolPrize,
}

export enum ELastResultSlot {
  Main = 0,
  Free,
}

export enum ECollectorType {
  None,
  Normal,
  Plus,
  Multiply,
  Expand,
  Respin,
  CollectAll,
}

export enum EStatusLine {
  None = 0,
  InsertCredit_NoCredit,
  InsertCredit_LessThenBet,
  PressStart,
  PressStart_SelectBet,
  SelectBet,
  GoodLuck,
  SelectRedBlack,
  ShowWinCombinations,
}

export enum ERightStatusLine {
  None = 0,
  RiskOrCashOut,
  GameOver,
}

export enum ELeftStatusLine {
  None = 0,
  GambleCompleted,
}

export type SymbolId = number;
export type SymbolIds = SymbolId[];
/** [reel index][row index] -> symbol */
export type SymbolGrid = SymbolId[][];
/** [reel index] -> reel strip */
export type Reels = SymbolIds[];
/** [reel index] -> stop offset in the reel strip */
export type ReelsOffset = number[];
/** [reel index] -> row */
export type Line = number[];
export type Lines = Line[];
export type RngRanges = number[];

export class SymbolGridCoordinates {
  constructor(public reelId = 0, public rowId = 0) {}

  equals(other: SymbolGridCoordinates) {
    return this.reelId === other.reelId && this.rowId === other.rowId;
  }

  key() {
    return `${this.reelId}:${this.rowId}`;
  }
}

export class SymbolViewInfo {
  constructor(public symbolId: SymbolId = -1, public coord = new SymbolGridCoordinates()) {}

  key() {
    return `${this.symbolId}@${this.coord.key()}`;
  }
}

export type SymbolViewInfos = SymbolViewInfo[];

export interface CollectorInfo {
  type: ECollectorType;
  bonusValue: number;
}

export interface Fraction {
  numerator: number;
  denominator: number;
}

export interface Multiplier {
  type: MultiplierType;
  currency: CurrencyType;
  factor: number;
}

export class Multipliers {
  static readonly One = new Multipliers();
  data: Multiplier[] = [];

  Clone() {
    const result = new Multipliers();
    result.data = this.data.map(multiplier => ({ ...multiplier }));
    return result;
  }

  /** this *= rhs */
  MultiplyBy(rhs: Multipliers) {
    for (const multiplier of rhs.data) {
      const found = this.data.find(item => item.type === multiplier.type && item.currency === multiplier.currency);
      if (found) found.factor *= multiplier.factor;
      else this.data.push({ ...multiplier });
    }
    return this;
  }

  GetFactor(currency: CurrencyType) {
    return this.data.filter(multiplier => multiplier.currency === currency).reduce((factor, multiplier) => factor * multiplier.factor, 1);
  }

  empty() {
    return this.data.length === 0;
  }
}

/** A paytable by symbol: symbolCountPayout[symbolId][count] times the bet. */
export class PayTable {
  constructor(public currencyType: CurrencyType = Currency.Undefined, public symbolCountPayout: number[][] = []) {}

  HasPayout(symbolId: SymbolId, count: number) {
    const countPayout = this.symbolCountPayout[symbolId];
    if (!countPayout || count < 0 || count >= countPayout.length) return false;
    return countPayout[count] !== 0;
  }

  Payout(bet: number, symbolId: SymbolId, count: number, multipliers: Multipliers, out: Currencies) {
    const countPayout = this.symbolCountPayout[symbolId];
    if (!countPayout || count < 0 || count >= countPayout.length) return 0;
    const amount = Math.trunc(bet * countPayout[count] * multipliers.GetFactor(this.currencyType));
    out.Add(this.currencyType, amount);
    return amount;
  }
}

/** A paytable of some symbols: symbolCountPayout.get(symbolId)[count] times the bet. */
export class PayTableV2 {
  constructor(public currencyType: CurrencyType = Currency.Undefined, public symbolCountPayout = new Map<SymbolId, number[]>()) {}

  HasPayout(symbolId: SymbolId, count: number) {
    const countPayout = this.symbolCountPayout.get(symbolId);
    if (!countPayout || count < 0 || count >= countPayout.length) return false;
    return countPayout[count] !== 0;
  }

  Payout(bet: number, symbolId: SymbolId, count: number, multipliers: Multipliers, out: Currencies) {
    const countPayout = this.symbolCountPayout.get(symbolId);
    if (!countPayout || count < 0 || count >= countPayout.length) return 0;
    const amount = Math.trunc(bet * countPayout[count] * multipliers.GetFactor(this.currencyType));
    out.Add(this.currencyType, amount);
    return amount;
  }
}

export type PayTables = PayTable[];
export type PayTablesV2 = PayTableV2[];

export class PayoutSummary {
  rewards = new Currencies();
  combinations = 0;

  /** this += rhs */
  AddSummary(rhs: PayoutSummary) {
    this.rewards.AddAll(rhs.rewards);
    this.combinations += rhs.combinations;
    return this;
  }

  Clone() {
    const result = new PayoutSummary();
    result.rewards = this.rewards.Clone();
    result.combinations = this.combinations;
    return result;
  }
}

/** Currencies *= Multipliers: every amount times its currency's factor, without the zero amounts. */
export function MultiplyCurrencies(currencies: Currencies, multipliers: Multipliers) {
  const result = new Currencies();
  for (const [type, amount] of currencies) result.Set(type, Math.trunc(amount * multipliers.GetFactor(type)));
  result.RemoveZeroAmounts();
  return result;
}

export function format_as(roundType: RoundType) {
  return RoundType[roundType];
}
