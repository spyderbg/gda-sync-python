// Egt::Game::Currency, Currencies and RoundType (Egt/Game/Math/Common.data.h).

export type CurrencyType = number;

export const GameCurrency = {
  Undefined: 0,
  Credits: 1,
  ToString(type: CurrencyType) {
    return type === 1 ? 'Credits' : type === 0 ? 'Undefined' : `Currency${type}`;
  },
} as const;

export type GameRoundType = number;
export const RoundType_Undefined: GameRoundType = 0;
export const RoundType_Main: GameRoundType = 1;

/** Amounts by currency, kept sorted by currency like the C++ std::map. Amounts are integers; as in C++, a currency whose
 * amount becomes 0 is removed. */
export class Currencies implements Iterable<[CurrencyType, number]> {
  readonly data = new Map<CurrencyType, number>();

  constructor(type?: CurrencyType, amount?: number) {
    if (type !== undefined && amount !== undefined) this.Add(type, amount);
  }

  static From(entries: Iterable<[CurrencyType, number]>) {
    const result = new Currencies();
    for (const [type, amount] of entries) result.Add(type, amount);
    return result;
  }

  Clone() {
    return Currencies.From(this.data);
  }

  Get(type: CurrencyType) {
    return this.data.get(type) ?? 0;
  }

  Set(type: CurrencyType, amount: number) {
    if (!amount) {
      this.data.delete(type);
      return;
    }
    this.data.set(type, amount);
    this.sort();
  }

  Add(type: CurrencyType, amount: number) {
    this.Set(type, this.Get(type) + amount);
  }

  RemoveZeroAmounts() {
    for (const [type, amount] of [...this.data]) if (amount === 0) this.data.delete(type);
  }

  empty() {
    return this.data.size === 0;
  }

  /** this += other */
  AddAll(other: Currencies) {
    for (const [type, amount] of other) this.Add(type, amount);
    return this;
  }

  /** this -= other */
  SubtractAll(other: Currencies) {
    for (const [type, amount] of other) this.Add(type, -amount);
    return this;
  }

  Plus(other: Currencies) {
    return this.Clone().AddAll(other);
  }

  Minus(other: Currencies) {
    return this.Clone().SubtractAll(other);
  }

  [Symbol.iterator]() {
    return this.data[Symbol.iterator]();
  }

  toJSON() {
    return Object.fromEntries(this.data);
  }

  toString() {
    return `{${[...this.data].map(([type, amount]) => `${type}:${amount}`).join(',')}}`;
  }

  private sort() {
    const sorted = [...this.data].sort((a, b) => a[0] - b[0]);
    this.data.clear();
    for (const [type, amount] of sorted) this.data.set(type, amount);
  }
}
