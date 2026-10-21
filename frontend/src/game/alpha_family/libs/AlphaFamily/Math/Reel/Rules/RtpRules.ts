// Egt::Game::AlphaFamily::RtpRules (AlphaFamily/Math/Reel/Rules/RtpRules.h/.cpp): the RTP reducer, which forces a zero
// win round for a chance per bet, before other features.

import { RngOp } from '@game/engine/GameCore/Random/IRng';
import { RoundConfigError } from '../../Common/Exceptions';
import { PayoutSummary } from '../../Common/Common.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import { AddPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { RtpRulesConfig } from './RtpRules.data';

export class RtpRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: RtpRulesConfig) {
    super(roundRules);
  }

  GetConfig() {
    return this.m_config;
  }

  GetForcedResult(context: Context): Context | null {
    // check left over first, then rtp reducer
    if (this.IsNormalRoundLeftOver(context) && this.IsNormalRoundRtpReducer(context)) return null;
    // Note: zero win rounds should be common and impossible to miss after so many attempts
    const attempts = 1_000_000;
    for (let i = 0; i < attempts; ++i) {
      /// Use visualDiversityRng as rng when looking for a zero round
      const ctx = new Context(context.input, context.visualRng, context.visualRng);
      this.GetRoundRules().CalculateRoundInternal(ctx);
      const summary = new PayoutSummary();
      for (const phase of ctx.phases) AddPhase(summary, phase);
      if (summary.rewards.empty()) return ctx;
    }
    throw new RoundConfigError(`RtpRules::GetForcedResult failed after ${attempts} attempts`);
  }

  private IsNormalRoundRtpReducer(context: Context) {
    const chance = this.m_config.zeroRoundChancePerBet.get(context.input.bet);
    if (!chance || !(chance.numerator > 0)) return true;
    const roll = context.mathRng.Generate(RngOp.RtpReducer, chance.denominator);
    return !(roll < chance.numerator);
  }

  private IsNormalRoundLeftOver(context: Context) {
    if (!this.m_config.hasLeftOver) return true;
    const bet = context.input.bet;
    const consume = context.input.consume.Get(context.input.betType);
    if (consume === bet) return true;
    if (consume > bet || consume < 0) return true;
    const roll = context.mathRng.Generate(RngOp.LeftoverBet, bet);
    return roll < consume;
  }
}
