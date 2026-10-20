// Egt::Game::AlphaFamily::CollectorRules (AlphaFamily/Math/Reel/Rules/CollectorRules.h/.cpp): collector symbols.

import { Currencies } from '../../../../../../engine/Game/Math/Common.data';
import { ECollectorType, Multipliers } from '../../Common/Common.data';
import { SelectRandomValue } from '../../Common/Weighted';
import type { ReelRoundRules } from '../ReelRoundRules';
import { SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { CollectorRulesConfig } from './CollectorRules.data';

export class CollectorRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: CollectorRulesConfig) {
    super(roundRules);
  }

  GetConfig() {
    return this.m_config;
  }

  Update(context: Context, spinPhase: SpinReelsPhase) {
    if (this.m_config.symbolId < 0) return;
    if (!this.m_config.distribution.range.length) return;
    if (!BaseReelRules.HasSymbol(spinPhase.stop, this.m_config.symbolId)) return;
    const collector = SelectRandomValue(this.m_config.distribution, context.mathRng);
    spinPhase.collector.type = collector.type;
    if (collector.type === ECollectorType.Plus || collector.type === ECollectorType.Multiply) {
      spinPhase.collector.bonusValue = SelectRandomValue(collector.bonusValue, context.mathRng);
    }
    spinPhase.summary.rewards.AddAll(this.CollectFrom(context, spinPhase));
  }

  CollectFrom(context: Context, spinPhase: SpinReelsPhase) {
    const rewards = new Currencies();
    for (const payTable of this.m_config.paytable) {
      for (const symbolId of payTable.symbolCountPayout.keys()) {
        const reward = new Currencies();
        const count = BaseReelRules.CountSymbols(spinPhase.stop, symbolId);
        payTable.Payout(context.input.bet, symbolId, count, Multipliers.One, reward);
        this.ModifyReward(spinPhase, reward);
        rewards.AddAll(reward);
      }
    }
    return rewards;
  }

  ModifyReward(spinPhase: SpinReelsPhase, reward: Currencies) {
    const { type, bonusValue } = spinPhase.collector;
    if (type !== ECollectorType.Plus && type !== ECollectorType.Multiply) return;
    for (const [currency, amount] of [...reward]) reward.Set(currency, type === ECollectorType.Plus ? amount + bonusValue : amount * bonusValue);
  }
}
