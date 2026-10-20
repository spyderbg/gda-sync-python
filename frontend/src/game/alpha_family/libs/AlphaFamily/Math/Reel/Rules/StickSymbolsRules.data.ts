// Egt::Game::AlphaFamily::StickSymbolsRulesConfig (AlphaFamily/Math/Reel/Rules/StickSymbolsRules.data.h).

import type { SymbolId } from '../../Common/Common.data';
import type { Weighted } from '../../Common/Weighted';

export interface StickSymbolsRulesConfig {
  symbolId: SymbolId;
  /** Each reel has a distribution of the 2^rows patterns of rows the symbol sticks to. */
  distrPerReel: Weighted<number>[];
}

export function StickSymbolsRulesConfig(): StickSymbolsRulesConfig {
  return { symbolId: -1, distrPerReel: [] };
}
