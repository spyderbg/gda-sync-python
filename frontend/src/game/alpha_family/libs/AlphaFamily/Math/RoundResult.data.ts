// Egt::Game::AlphaFamily::RoundResult (AlphaFamily/Math/RoundResult.data.h/.cpp).
//
// A round's result keeps its input and the random numbers it used (its replay), its phases and its summary. In C++ the
// phases can be dropped and recovered from the replay; here they are always kept.

import { Currencies, type CurrencyType } from '@game/engine/Game/Math/Common.data';
import type { IRng, RngNumber } from '@game/engine/GameCore/Random/IRng';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IMathRules } from '../RuntimeExport/IMathRules';
import { Currency, PayoutSummary, RoundErrorCode, RoundType } from './Common/Common.data';
import { HoldAndSpinRoundInput } from './HoldAndSpin/HoldAndSpinRoundInput.data';
import { ReelRoundInput } from './Reel/ReelRoundInput.data';
import type { RoundInput } from './RoundInput';
import type { RoundPhases } from './RoundPhase';
import { WheelRoundInput } from './Wheel/WheelRoundInput.data';

export type { RoundInput } from './RoundInput';
export type { RoundPhase, RoundPhases } from './RoundPhase';

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
    const input = this.m_replay.input;
    if (input instanceof HoldAndSpinRoundInput) return input.triggerRoundType;
    return input.roundType;
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

      if (delta > 0) {
        rewarded.Add(currency, delta);
      } else if (delta < 0) {
        consumed.Add(currency, -delta);
      }
    }
  }

  CalculateAndApplyCapping(available: Currencies, caps: Currencies) {
    this.CalculateCapping(available, caps);
    this.ApplyCapping();
  }

  private ApplyCapping() {
    if (!this.m_cappingInfo) return;

    for (const [type, amount] of this.m_cappingInfo.cappedCurrencies) {
      this.m_summary.rewards.Set(type, amount);
    }
  }

  private CalculateCapping(available: Currencies, caps: Currencies) {
    this.m_cappingInfo = null;

    const overcap: CurrencyType[] = []; // currency which hits the cap

    for (const [type, capping] of caps) {
      const current = available.Get(type);
      const reward = this.m_summary.rewards.Get(type);

      if (current + reward >= capping) {
        overcap.push(type);
      }
    }

    if (overcap.length) {
      // save capping info
      this.m_cappingInfo = { rewardsBeforeCap: this.m_summary.rewards.Clone(), cappedCurrencies: [], remainingFeatures: false };

      // apply cap
      for (const type of overcap) {
        this.m_cappingInfo.cappedCurrencies.push([type, caps.Get(type) - available.Get(type)]);
      }

      // override rest of the currencies with 0
      this.m_overrideCurrencies = [];

      const creditHit = overcap.includes(Currency.Credits);

      for (const [type] of available) {
        if (creditHit) {
          // if credits are hit - reset all except credits
          if (type === Currency.Credits) continue;
        } else {
          // if no-credit cap is hit - reset all except (credits, coins, wheel)
          if (type === Currency.Credits) continue;
          if (type === Currency.CoinsSpinEnergy) continue;
          if (type === Currency.WheelToken) continue;
        }
        this.m_overrideCurrencies.push([type, 0]);
      }
    }
  }
}

export class RoundError {
  constructor(public code = RoundErrorCode.Undefined, public message = '') {}
}

export type RoundResultOrError = RoundResult | RoundError;

export function CalculateRound(runtime: Runtime, input: RoundInput, mathRng: IRng): RoundResultOrError {
  const math = runtime.Get(IMathRules);
  if (input instanceof ReelRoundInput) {
    const rules = math.GetReelRoundRules(input.roundType);
    return rules.CalculateRound(input, mathRng);
  }
  if (input instanceof HoldAndSpinRoundInput) {
    const rules = math.GetHoldAndSpinRoundRules(input.triggerRoundType);
    return rules.CalculateRound(input, mathRng);
  }
  const rules = math.GetWheelRoundRules(input.roundType);
  return rules.CalculateRound(input, mathRng);
}

export function RecoverRound(runtime: Runtime, replay: RoundReplay): RoundResultOrError {
  const math = runtime.Get(IMathRules);
  const input = replay.input;
  if (input instanceof ReelRoundInput) {
    const rules = math.GetReelRoundRules(input.roundType);
    return rules.RecoverRound(replay);
  }
  if (input instanceof HoldAndSpinRoundInput) {
    const rules = math.GetHoldAndSpinRoundRules(input.triggerRoundType);
    return rules.RecoverRound(replay);
  }
  if (input instanceof WheelRoundInput) {
    const rules = math.GetWheelRoundRules(input.roundType);
    return rules.RecoverRound(replay);
  }
  return new RoundError(RoundErrorCode.InputError, 'RecoverRound: unknown round input');
}
