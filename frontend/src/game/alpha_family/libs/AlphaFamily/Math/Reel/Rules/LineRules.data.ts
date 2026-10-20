// Egt::Game::AlphaFamily::LineRulesConfig (AlphaFamily/Math/Reel/Rules/LineRules.data.h).

import { type Lines, Multipliers, type PayTables, type SymbolId } from '../../Common/Common.data';

export interface WildSymbol {
  symbolId: SymbolId;
  multipliers: Multipliers;
  include: Set<SymbolId>;
  exclude: Set<SymbolId>;
}

export function WildSymbol(symbolId: SymbolId = -1): WildSymbol {
  return { symbolId, multipliers: new Multipliers(), include: new Set(), exclude: new Set() };
}

export type WildSymbols = WildSymbol[];

export interface LineRulesConfig {
  lines: Lines;
  linePayTables: PayTables;
  wildSymbols: WildSymbols;
}

export function LineRulesConfig(): LineRulesConfig {
  return { lines: [], linePayTables: [], wildSymbols: [] };
}
