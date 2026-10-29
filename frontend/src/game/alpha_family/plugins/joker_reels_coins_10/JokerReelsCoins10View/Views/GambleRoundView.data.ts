// Egt::Game::AlphaFamily::GambleRoundViewConfig (JokerReelsCoins10View/Views/GambleRoundView.data.h): the IData of the
// gamble view (idata/<resolution>/GambleRoundView.json).

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';

export interface GambleRoundViewConfig {
  visibleHistorySize: number;

  cardSlide1DurationMS: number;
  cardSlide2DurationMS: number;

  startingCardPoint1: Point;
  startingCardPoint2: Point;

  targetCardPoint1: Point;
  targetCardPoint2: Point;
}
