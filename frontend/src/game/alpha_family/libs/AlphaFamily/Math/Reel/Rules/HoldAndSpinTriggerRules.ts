// Egt::Game::AlphaFamily::HoldAndSpinTriggerRules (AlphaFamily/Math/Reel/Rules/HoldAndSpinTriggerRules.h/.cpp).

import { Currencies } from '../../../../../../engine/Game/Math/Common.data';
import { CombinationType, Currency, Multipliers } from '../../Common/Common.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import { ReelCombination, SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { HoldAndSpinTriggerRulesConfig } from './HoldAndSpinTriggerRules.data';

export class HoldAndSpinTriggerRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: HoldAndSpinTriggerRulesConfig) {
    super(roundRules);
  }

  GetConfig() {
    return this.m_config;
  }

  Update(context: Context, spinPhase: SpinReelsPhase) {
    // check if configured
    if (this.m_config.triggerSymbolCount === 0) return;
    // check if triggered
    const count = BaseReelRules.CountSymbols(spinPhase.stop, this.m_config.triggerSymbolIds);
    if (count < this.m_config.triggerSymbolCount) return;
    // add combination
    const comb = new ReelCombination();
    comb.type = CombinationType.HoldAndSpinTrigger;
    comb.id = this.m_config.combinationId;
    comb.symbolViewInfos = BaseReelRules.GetAllCoordinates(spinPhase.stop, this.m_config.triggerSymbolIds);
    comb.rewards = this.GetRewards(context, spinPhase);
    comb.symbolId = this.m_config.combinationId;
    comb.symbolCount = count;
    spinPhase.combinations.push(comb);
  }

  GetRewards(context: Context, spinPhase: SpinReelsPhase) {
    const rewards = new Currencies();
    const bet = context.input.bet;
    // reward HoldAndSpinEnergy
    rewards.Add(Currency.HoldAndSpinEnergy, this.m_config.initialSpins * bet);
    // reward trigger symbols paytable
    for (const payTable of this.m_config.paytable) {
      for (const symbolId of payTable.symbolCountPayout.keys()) {
        payTable.Payout(bet, symbolId, BaseReelRules.CountSymbols(spinPhase.stop, symbolId), Multipliers.One, rewards);
      }
    }
    return rewards;
  }
}
