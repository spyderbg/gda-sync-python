// Egt::Game::AlphaFamily::ScatterRulesConfig (AlphaFamily/Math/Reel/Rules/ScatterRules.data.h).

import type { PayTablesV2, SymbolId } from '../../Common/Common.data';

export interface ScatterSymbol {
  symbolId: SymbolId;
  combinationId: number;
}

export type ScatterSymbols = ScatterSymbol[];

export interface ScatterRulesConfig {
  scatterSymbols: ScatterSymbols;
  scatterPayTables: PayTablesV2;
}

export function ScatterRulesConfig(): ScatterRulesConfig {
  return { scatterSymbols: [], scatterPayTables: [] };
}
