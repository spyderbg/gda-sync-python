// Egt::Game::AlphaFamily::WinFiguresVisualConfig (JokerReelsCoins10View/Visuals/WinFiguresVisual.data.h): the win
// animations of the symbols, and the wilds over a stacked wild figure (by the stack's size) and under it.

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import type { SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';

export interface WinFiguresVisualConfig {
  wildFigureSymbolId: number;

  wildSymbolAnimOffsetX: number;
  wildSymbolAnimOffsetY: number;

  figureScale?: Point; // {1.0f, 1.0f}

  winFiguresRssKeys: Record<SymbolId, string>;
  wildFiguresRssKeys: Record<SymbolId, string>;
  singleWildFigureRssKey: string;
}
