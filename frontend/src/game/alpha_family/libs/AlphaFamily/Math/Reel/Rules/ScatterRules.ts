// Egt::Game::AlphaFamily::ScatterRules (AlphaFamily/Math/Reel/Rules/ScatterRules.h/.cpp): scatter combinations, which
// count a symbol anywhere on the screen.

import { CombinationType } from '../../Common/Common.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import { ReelCombination, SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { ScatterRulesConfig } from './ScatterRules.data';

export class ScatterRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: ScatterRulesConfig) {
    super(roundRules);
  }

  GetScatterPayTables() {
    return this.m_config.scatterPayTables;
  }

  GetScatterSymbols() {
    return this.m_config.scatterSymbols;
  }

  CreateCombinations(context: Context, spinPhase: SpinReelsPhase) {
    for (const scatter of this.m_config.scatterSymbols) {
      const symbolCount = BaseReelRules.CountSymbols(spinPhase.stop, scatter.symbolId);
      if (symbolCount <= 0) continue;
      const combination = new ReelCombination();
      combination.type = CombinationType.Scatter;
      combination.id = scatter.combinationId;
      combination.symbolId = scatter.symbolId;
      combination.symbolCount = symbolCount;
      combination.symbolViewInfos = BaseReelRules.GetAllCoordinates(spinPhase.stop, scatter.symbolId);
      combination.bet = context.input.bet;
      spinPhase.combinations.push(combination);
    }
  }

  RewardCombinations(phase: SpinReelsPhase) {
    for (const combination of phase.combinations) {
      if (combination.type === CombinationType.Scatter) combination.AddRewardsFrom(this.m_config.scatterPayTables);
    }
  }
}
