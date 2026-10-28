// The C++ integer types, as names of TypeScript's number: a declaration that names one (multipliers: uint32_t[]) says
// what the C++ of it is, which the C++ export keeps (TypeScript itself has only number).

export type int = number;
export type int8_t = number;
export type unsigned = number;
export type int32_t = number;
export type int64_t = number;
export type uint32_t = number;
export type uint64_t = number;
export type size_t = number;
export type float = number;
export type double = number;

/** C++'s const T*: a T, or none (a function's result the C++ returns by its pointer, std::get_if's). */
export type ConstPointer<T> = T | null;

/** C++'s T*: a T, or none (what RuntimeTryGet returns, a function that gives it). */
export type Pointer<T> = T | null | undefined;

/** C++'s static_cast<T>(x) between number types (T one of the names above): x, as TypeScript has only number. */
export function static_cast<_T>(x: number): number {
  return x;
}

/** Egt's AnyData: any data struct, as IRecovery's state change actions carry. */
export type AnyData = object;

/** C++'s std::get_if<T>(&x) of a variant: x if it is a T, else none. */
export function get_if<T>(type: abstract new (...args: never[]) => T, x: unknown): ConstPointer<T> {
  return x instanceof type ? (x as T) : null;
}

/** C++'s copy of a value (a vector, a struct): a deep copy here, where TypeScript would share its arrays and objects.
 * The C++ of Copy(x) is x. */
export function Copy<T>(x: T): T {
  if (Array.isArray(x)) return x.map(item => Copy(item)) as T;
  if (x instanceof Map) return new Map([...x].map(([key, value]) => [key, Copy(value)])) as T;
  if (x instanceof Set) return new Set(x) as T;
  if (x && typeof x === 'object') {
    const result = Object.create(Object.getPrototypeOf(x)) as Record<string, unknown>;
    for (const [key, value] of Object.entries(x)) result[key] = Copy(value);
    return result as T;
  }
  return x;
}
