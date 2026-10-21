// Egt::Game::AlphaFamily::RoundResult (AlphaFamily/Math/RoundResult.data.h/.cpp).
//
// A round's result keeps its input and the random numbers it used (its replay), its phases and its summary. In C++ the
// phases can be dropped and recovered from the replay; here they are always kept.

import { Currencies, type CurrencyType } from '@game/engine/Game/Math/Common.data';
import type { RngNumber } from '@game/engine/GameCore/Random/IRng';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { PayoutSummary, RoundErrorCode, RoundType } from './Common/Common.data';
import type { ReelRoundPhases } from './Reel/ReelRoundPhase.data';
import { ReelRoundInput } from './Reel/ReelRoundInput.data';

/** The inputs of the rounds the game has (std::variant<ReelRoundInput, HoldAndSpinRoundInput, WheelRoundInput>). */
export type RoundInput = ReelRoundInput;
export type RoundPhases = ReelRoundPhases;

export interface RoundReplay {
  input: RoundInput;
  rngs: RngNumber[];
}

export interface CappingInfo {
  rewardsBeforeCap: Currencies;
  cappedCurrencies: [CurrencyType, number][];
  remainingFeatures: boolean;
}

export type OverrideCurrencies = [CurrencyType, number][];

export class RoundResult {
  m_replay: RoundReplay = { input: new ReelRoundInput(), rngs: [] };
  m_overrideCurrencies: OverrideCurrencies = [];
  m_cappingInfo: CappingInfo | null = null;
  m_phases: RoundPhases = [];
  m_summary = new PayoutSummary();

  GetInput(): RoundInput {
    return this.m_replay.input;
  }

  GetRoundType(): RoundType {
    return this.m_replay.input.roundType;
  }

  GetTriggerRoundType(): RoundType {
    return this.m_replay.input.roundType;
  }

  GetBet() {
    return this.m_replay.input.bet;
  }

  /** C++'s takes the runtime (the browser's needs none): a function outside a state passes its own. */
  GetPhases(_runtime?: Runtime): RoundPhases {
    return this.m_phases;
  }

  GetSummary(_runtime?: Runtime): PayoutSummary {
    return this.m_summary;
  }

  ForceGetPhasesWithoutRecovery() {
    return this.m_phases;
  }

  ForceGetSummaryWithoutRecovery() {
    return this.m_summary;
  }

  ApplyOverride(rewarded: Currencies, consumed: Currencies) {
    for (const [currency, value] of this.m_overrideCurrencies) {
      const delta = value - (rewarded.Get(currency) - consumed.Get(currency));
      if (delta > 0) rewarded.Add(currency, delta);
      else if (delta < 0) consumed.Add(currency, -delta);
    }
  }

  CalculateAndApplyCapping(available: Currencies, caps: Currencies) {
    this.CalculateCapping(available, caps);
    this.ApplyCapping();
  }

  private ApplyCapping() {
    if (!this.m_cappingInfo) return;
    for (const [type, amount] of this.m_cappingInfo.cappedCurrencies) this.m_summary.rewards.Set(type, amount);
  }

  private CalculateCapping(available: Currencies, caps: Currencies) {
    this.m_cappingInfo = null;
    // currencies which hit the cap
    const overcap = [...caps].filter(([type, capping]) => available.Get(type) + this.m_summary.rewards.Get(type) >= capping).map(([type]) => type);
    if (!overcap.length) return;
    this.m_cappingInfo = {
      rewardsBeforeCap: this.m_summary.rewards.Clone(),
      cappedCurrencies: overcap.map(type => [type, caps.Get(type) - available.Get(type)]),
      remainingFeatures: false,
    };
  }
}

export class RoundError {
  constructor(public code = RoundErrorCode.Undefined, public message = '') {}
}

export type RoundResultOrError = RoundResult | RoundError;
