// Egt::Game::AlphaFamily::HoldAndSpinRoundRulesConfig (AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundRules.data.h).

import type { ERoundTags, PayTablesV2, Reels, SymbolId, SymbolIds } from '../Common/Common.data';
import { RoundType } from '../Common/Common.data';
import { EmptyWeighted, type Weighted } from '../Common/Weighted';
import type { ReplaceSymbolsMap } from '../Reel/Rules/SpinRules.data';

export interface HoldAndSpinRoundRulesConfig {
  triggerRoundType: RoundType;

  triggerSymbolIds: SymbolIds; // symbol ids counted for the trigger
  triggerSymbolCount: number; // count required to enter hold and spin
  initialSpins: number; // spins after symbol drop

  dropSymbolId: SymbolId; // symbol id to be dropped
  dropDistribution: Weighted<boolean>; // distribution used to drop symbols during hold and spin
  replaceMaps: Weighted<ReplaceSymbolsMap>; // rules how to replace (give values) to dropped symbols

  paytable: PayTablesV2; // rewards for dropped symbols during hold and spin

  fakeReels: Reels; // fake reels used during spins
  fakeDrops: Weighted<SymbolId>; // fake symbols used for results in no-drop case
  winTypeThresholds: Map<number, ERoundTags>; // <times bet, win type> thresholds for different win types
  winTypeThresholdsPerSymbol: Map<SymbolId, Map<number, ERoundTags>>; // <symbol, <count , win type>> thresholds for different win types
}

export function HoldAndSpinRoundRulesConfig(): HoldAndSpinRoundRulesConfig {
  return {
    triggerRoundType: RoundType.Undefined, triggerSymbolIds: [], triggerSymbolCount: 0, initialSpins: 0, dropSymbolId: 0,
    dropDistribution: EmptyWeighted(), replaceMaps: EmptyWeighted(), paytable: [], fakeReels: [], fakeDrops: EmptyWeighted(),
    winTypeThresholds: new Map(), winTypeThresholdsPerSymbol: new Map(),
  };
}
