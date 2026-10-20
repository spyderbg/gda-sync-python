// Egt::Game::AlphaFamily::Weighted<T> (Weighted.h, WeightedValue.h) and the selection functions of WeightedValues.h.

import { type IRng, RngOp } from '../../../../../engine/GameCore/Random/IRng';

export interface WeightedValue<T> {
  weight: number;
  value: T;
}

export interface Weighted<T> {
  op: RngOp;
  /** Whether a value can be selected again (when false, SelectRandomValue takes the values on screen as offsets). */
  repetition: boolean;
  range: WeightedValue<T>[];
}

/** Weight adjustments by value, for selection without repetition. */
export type WeightedOffset<T> = Map<T, number>;

export function EmptyWeighted<T>(op = RngOp.Undefined): Weighted<T> {
  return { op, repetition: true, range: [] };
}

export function GetTotalWeight<T>(range: WeightedValue<T>[]) {
  return range.reduce((sum, item) => sum + item.weight, 0);
}

export function GetTotalOffset<T>(offset: WeightedOffset<T>) {
  let sum = 0;
  for (const value of offset.values()) sum += value;
  return sum;
}

// main function to select random element from weighted container
export function SelectRandomValue<T>(container: Weighted<T>, rng: IRng, offset?: WeightedOffset<T>): T {
  if (offset) {
    const range = GetTotalWeight(container.range) + GetTotalOffset(offset);
    let roll = rng.Generate(container.op, range);
    for (const item of container.range) {
      const weight = item.weight + (offset.get(item.value) ?? 0);
      if (roll < weight) return item.value;
      roll -= weight;
    }
    throw new Error("Roll doesn't match weighted values.");
  }
  let roll = rng.Generate(container.op, GetTotalWeight(container.range));
  for (const item of container.range) {
    if (roll < item.weight) return item.value;
    roll -= item.weight;
  }
  throw new Error("Roll doesn't match weighted values.");
}

export function SelectRandomIndex<T>(container: Weighted<T>, rng: IRng): number {
  let roll = rng.Generate(container.op, GetTotalWeight(container.range));
  for (let index = 0; index < container.range.length; index++) {
    if (roll < container.range[index].weight) return index;
    roll -= container.range[index].weight;
  }
  throw new Error("Roll doesn't match weighted values.");
}

export function SelectValueFromIndex<T>(container: Weighted<T>, index: number): T {
  const item = container.range[index];
  if (!item) throw new Error(`Weighted index ${index} is out of range`);
  return item.value;
}
