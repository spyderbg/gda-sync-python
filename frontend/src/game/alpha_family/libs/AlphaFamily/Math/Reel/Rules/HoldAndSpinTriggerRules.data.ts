// Egt::Game::AlphaFamily::HoldAndSpinTriggerRulesConfig (AlphaFamily/Math/Reel/Rules/HoldAndSpinTriggerRules.data.h).

import type { PayTablesV2, SymbolIds } from '../../Common/Common.data';

export interface HoldAndSpinTriggerRulesConfig {
  triggerSymbolIds: SymbolIds;
  triggerSymbolCount: number;
  initialSpins: number;
  combinationId: number;
  paytable: PayTablesV2;
}

export function HoldAndSpinTriggerRulesConfig(): HoldAndSpinTriggerRulesConfig {
  return { triggerSymbolIds: [], triggerSymbolCount: 0, initialSpins: 0, combinationId: 0, paytable: [] };
}
