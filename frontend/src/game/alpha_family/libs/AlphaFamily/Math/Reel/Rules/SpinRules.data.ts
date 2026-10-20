// Egt::Game::AlphaFamily::SpinRulesConfig (AlphaFamily/Math/Reel/Rules/SpinRules.data.h).

import type { Reels, SymbolId } from '../../Common/Common.data';
import { EmptyWeighted, type Weighted } from '../../Common/Weighted';

export interface Symbol {
  id: SymbolId;
  name: string;
}

/** The distribution each symbol is replaced from, by symbol. */
export type ReplaceSymbolsMap = Map<SymbolId, Weighted<SymbolId>>;

export interface SpinRulesConfig {
  symbols: Symbol[];
  weightedReels: Weighted<Reels>;
  replaceMaps: Weighted<ReplaceSymbolsMap>;
  additionalRowsToInclude: number;
}

export function SpinRulesConfig(): SpinRulesConfig {
  return { symbols: [], weightedReels: EmptyWeighted(), replaceMaps: EmptyWeighted(), additionalRowsToInclude: 0 };
}
