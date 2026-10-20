// Egt::Game::AlphaFamily::ExpandRulesConfig (AlphaFamily/Math/Reel/Rules/ExpandRules.data.h).

import type { SymbolId } from '../../Common/Common.data';

export enum ExpandPolicy {
  Always,
  WinForming,
}

export interface ExpandSymbol {
  symbolId: SymbolId;
  include: Set<SymbolId>;
  exclude: Set<SymbolId>;
  policy: ExpandPolicy;
}

export interface ExpandRulesConfig {
  expandSymbols: ExpandSymbol[];
}

export function ExpandRulesConfig(): ExpandRulesConfig {
  return { expandSymbols: [] };
}
