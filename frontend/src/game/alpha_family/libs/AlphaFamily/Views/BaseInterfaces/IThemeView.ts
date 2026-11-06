// Egt::Game::IThemeView (AlphaFamily/Views/BaseInterfaces/IThemeView.h/.cpp): a view that takes the look of a round
// (its theme), which the view manager sets on all of them (IViewManager.SetTheme). C++ nests ThemeType in IThemeView.
// Each theme has an element id suffix, "_" and its name in snake case (ThemeSuffix: "_tetra", "_hold_and_spin"), which C++
// derives from the enumerators' names at compile time, and this module once when it loads.

export enum ThemeType {
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

export interface IThemeView {
  SetTheme(theme: ThemeType): void;
}

export interface ThemeSuffixEntry {
  theme: ThemeType;
  suffix: string;
}

// C++'s namespace detail

function IsUpper(c: string) {
  return c >= 'A' && c <= 'Z';
}

function IsPascalCase(name: string) {
  if (name === '' || !IsUpper(name[0])) {
    return false;
  }
  for (const c of name) {
    if (!IsUpper(c) && !(c >= 'a' && c <= 'z') && !(c >= '0' && c <= '9')) {
      return false;
    }
  }
  return true;
}

// C++ reads the enumerator out of the compiler-generated signature, as magic_enum does. A TypeScript enum maps each of
// its values back to its name, and no name for a value that is not an enumerator.
function EnumeratorName(value: ThemeType) {
  return ThemeType[value] ?? '';
}

function IsThemeType(value: number) {
  return IsPascalCase(EnumeratorName(value as ThemeType));
}

// C++ sizes the suffix's std::array with SnakeCaseSuffixSize: a string needs no size here.
function ThemeSuffixChars(theme: ThemeType) {
  const name = EnumeratorName(theme);
  if (!IsPascalCase(name)) throw new Error('ThemeType enumerator name is expected in PascalCase');

  let suffix = '';
  for (const c of name) {
    if (IsUpper(c)) {
      suffix += '_';
      suffix += c.toLowerCase();
    } else {
      suffix += c;
    }
  }
  return suffix;
}

function AppendThemeSuffix(value: number, out: ThemeSuffixEntry[]) {
  if (IsThemeType(value)) {
    const theme = value as ThemeType;
    out.push({ theme, suffix: ThemeSuffixChars(theme) });
  }
}

function CollectThemeSuffixes(values: number[]) {
  const entries: ThemeSuffixEntry[] = [];

  for (const value of values) AppendThemeSuffix(value, entries);
  return entries;
}

// The enumerators are found by scanning the values 0..127, so one outside that range has no entry, and its
// ThemeSuffix is empty.
export const ThemeSuffixes: readonly ThemeSuffixEntry[] = CollectThemeSuffixes(Array.from({ length: 128 }, (_, value) => value));

export function ThemeSuffix(theme: ThemeType) {
  for (const entry of ThemeSuffixes) {
    if (entry.theme === theme) {
      return entry.suffix;
    }
  }
  return '';
}
