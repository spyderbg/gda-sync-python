// Egt::GameCore container helpers (GameCore/Common/ContainerHelpers.h), std::random_device and std::erase_if: what the
// C++ states use, with the same names, so that the TypeScript of a state reads, and translates, as its C++.

export function IsValidIndex<T>(container: readonly T[], index: number) {
  return index >= 0 && index < container.length;
}

export function Contains<T>(container: readonly T[] | ReadonlySet<T>, value: T) {
  return Array.isArray(container) ? container.includes(value) : (container as ReadonlySet<T>).has(value);
}

/** std::random_device()(): a random 32-bit number. */
export function RandomDevice() {
  return crypto.getRandomValues(new Uint32Array(1))[0];
}

/** Whether an array is of a class (a union of two array types, ReelCombinations | SymbolViewInfos): C++ has an overload
 * for each (export/translator). An empty array is of either. */
export function IsArrayOf<T>(values: readonly unknown[], Type: abstract new (...args: never[]) => T): values is T[] {
  return values.every(value => value instanceof Type);
}

/** The index of a value in a container, or -1. */
export function FindIndex<T>(container: readonly T[], value: T) {
  return container.indexOf(value);
}

/** std::erase_if: removes, in place, the values the predicate is true of (asked once of each, in order); how many it
 * removed. */
export function EraseIf<T>(container: T[], predicate: (value: T) => boolean) {
  let kept = 0;
  for (const value of container) if (!predicate(value)) container[kept++] = value;
  const removed = container.length - kept;
  container.length = kept;
  return removed;
}
