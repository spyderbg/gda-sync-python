// Egt::Game::IThemeView (AlphaFamily/Views/BaseInterfaces/IThemeView.h/.cpp): a view that takes the look of a round
// (its theme), which the view manager sets on all of them (IViewManager.SetTheme). C++ nests ThemeType in IThemeView.

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
