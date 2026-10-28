// Egt::Game::AlphaFamily::StatusLineVisualConfig (BurningHotCoinsView/Visuals/StatusLineVisual.data.h): how the
// status line writes a winning combination.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';

// (Line # Images|Scatter) Prize
export interface StatusLineVisualConfig {
  combinationLineImage: StatusLineVisualConfig.ElementConfig;
  combinationLineNumberText: StatusLineVisualConfig.ElementConfig;
  combinationSymbolImages: StatusLineVisualConfig.ElementConfig[];
  combinationScatterImage: StatusLineVisualConfig.ElementConfig;
  combinationPrizeText: StatusLineVisualConfig.ElementConfig;
}

export declare namespace StatusLineVisualConfig {
  interface ElementConfig {
    resId: string; // [id] image/style resource id
    offset?: Point; // [px] offset the draw position of the element
    paddingLeft?: number; // [px] add padding to the left of the element
    paddingRight?: number; // [px] add padding to the right of the element
  }
}
