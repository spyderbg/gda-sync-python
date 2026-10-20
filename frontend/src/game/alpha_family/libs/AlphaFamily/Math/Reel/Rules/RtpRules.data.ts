// Egt::Game::AlphaFamily::RtpRulesConfig (AlphaFamily/Math/Reel/Rules/RtpRules.data.h).

import type { Fraction } from '../../Common/Common.data';

export interface RtpRulesConfig {
  rtp: number;
  /** The chance of a forced zero round, by bet. */
  zeroRoundChancePerBet: Map<number, Fraction>;
  hasLeftOver: boolean;
}

export function RtpRulesConfig(): RtpRulesConfig {
  return { rtp: 0, zeroRoundChancePerBet: new Map(), hasLeftOver: false };
}
