// Egt::Game::AlphaFamily::WinFiguresVisualConfig (BurningHotCoinsView/Visuals/WinFiguresVisual.data.h): the win
// animations of the symbols.

import type { SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';

export interface WinFiguresVisualConfig {
  winFiguresRssKeys: Record<SymbolId, string>;
}
