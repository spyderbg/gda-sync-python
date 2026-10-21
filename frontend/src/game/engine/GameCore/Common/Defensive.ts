// Egt/GameCore/Common/Defensive.h: the C++ early exits are macros, ReturnIf(x, value) for if (x) return value;. The
// TypeScript writes them as an if without braces, and the translator writes the macro back:
//
//   if (x) return v;                  ReturnIf(x, v);              if (x) continue;    ContinueIf(x);
//   if (Unless(x)) return v;          ReturnUnless(x, v);          if (x) break;       BreakIf(x);
//   if (AssertIf(x)) return v;        AssertReturnIf(x, v);        (and ...Unless, Assert...)
//   if (AssertUnless(x)) return v;    AssertReturnUnless(x, v);
//
// An if with braces stays an if, as in the C++.

type Falsy = null | undefined | false | 0 | '';

/** The C++ ...Unless macros' condition: whether x does not hold (after if (Unless(x)) return;, x holds). */
export function Unless<T>(x: T): x is Extract<T, Falsy> {
  return !x;
}

/** The C++ Assert...If macros' condition: x, which the C++ asserts does not hold. */
export function AssertIf(x: unknown) {
  console.assert(!x, 'AssertIf');
  return !!x;
}

/** The C++ Assert...Unless macros' condition: whether x does not hold, which the C++ asserts does. */
export function AssertUnless<T>(x: T): x is Extract<T, Falsy> {
  console.assert(!!x, 'AssertUnless');
  return !x;
}

/** C's assert: x holds (the C++ asserts it in debug builds; the browser always). */
export function assert(x: unknown): asserts x {
  console.assert(!!x, 'assert');
}
