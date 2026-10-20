// Egt::Game::AlphaFamily::VisualAnalyzeConfig (AlphaFamily/Math/Reel/VisualAnalyse/VisualAnalyze.data.h).
// Config with no impact on math and reel outcome.

import { ERoundTags, type SymbolId } from '../../Common/Common.data';

export interface StackFigureConfig {
  visibleCols: number;
  visibleRows: number;
  stackedFigureId: SymbolId;
}

export interface VisualAnalyzeConfig {
  /** <symbol, count> attraction is set to all reels after this count */
  attractionScatterCount: Map<SymbolId, number>;
  /** <symbol, count> attraction is broken after symbol miss */
  attractionLineCount: Map<SymbolId, number>;
  /** <times bet, win type> thresholds for different win types */
  winTypeThresholds: Map<number, ERoundTags>;
  nearMissSymbolCount: Map<SymbolId, number>;
  stackFigureConfig: StackFigureConfig;
}

export function VisualAnalyzeConfig(): VisualAnalyzeConfig {
  return {
    attractionScatterCount: new Map(), attractionLineCount: new Map(), winTypeThresholds: new Map(), nearMissSymbolCount: new Map(),
    stackFigureConfig: { visibleCols: 0, visibleRows: 0, stackedFigureId: -1 },
  };
}
