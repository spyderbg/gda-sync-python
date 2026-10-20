// Egt::Game::AlphaFamily::CopySymbolsRulesConfig (AlphaFamily/Math/Reel/Rules/CopySymbolsRules.data.h).

import type { SymbolIds } from '../../Common/Common.data';

export interface CopySymbolsRulesConfig {
  symbolIds: SymbolIds;
}

export function CopySymbolsRulesConfig(): CopySymbolsRulesConfig {
  return { symbolIds: [] };
}
