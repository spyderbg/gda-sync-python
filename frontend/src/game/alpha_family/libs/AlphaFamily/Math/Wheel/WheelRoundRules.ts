// Egt::Game::AlphaFamily::WheelRoundRules (AlphaFamily/Math/Wheel/WheelRoundRules.h/.cpp): the rules of a wheel round
// (the coins exchange wheel, the gamble wheel): a sector chosen by weight pays its share of the bet.

import { Currencies, type CurrencyType } from '@game/engine/Game/Math/Common.data';
import { HistoryEngine, type IRng, MonteCarloEngineHat, ReplayEngine } from '@game/engine/GameCore/Random/IRng';
import { Currency, RoundErrorCode, RoundType } from '../Common/Common.data';
import { RoundConfigError, RoundInputError } from '../Common/Exceptions';
import { SelectRandomValue } from '../Common/Weighted';
import { RoundError, type RoundReplay, RoundResult, type RoundResultOrError } from '../RoundResult.data';
import { WheelRoundInput } from './WheelRoundInput.data';
import { WheelRoundPhase, type WheelRoundPhases } from './WheelRoundPhase.data';
import type { WheelRewardsPerSector, WheelRoundRulesConfig } from './WheelRoundRules.data';

class Context {
  phases: WheelRoundPhases = [];

  constructor(readonly input: WheelRoundInput, readonly mathRng: IRng, readonly visualRng: IRng) {}
}

export class WheelRoundRules {
  constructor(private readonly m_config: WheelRoundRulesConfig) {}

  ////////////////////////////////////////////////////////////////////////////////
  /// Config
  ////////////////////////////////////////////////////////////////////////////////

  GetConfig() {
    return this.m_config;
  }

  GetRoundType() {
    return this.m_config.roundType;
  }

  GetCoinCapping(capping: number) {
    if (capping <= 0) return 0;

    // coin capping is the credits cap devided by min payout coef from sectors
    const sectorPays: number[] = [];
    const sectors = this.m_config.sectors.range;

    // find min coin percent on wheel
    for (const s of sectors) {
      const payouts = s.value.payouts;
      const it = payouts.find(p => p.currencyType === Currency.Credits);
      if (!it) continue;

      sectorPays.push(it.pays);
    }

    if (!sectorPays.length) return 0;

    const minPays = Math.min(...sectorPays);
    if (minPays <= 0.0) return 0;

    const coinCapping = Math.ceil(capping / minPays);
    return coinCapping;
  }

  GetWheelRewardsPerSector(bet: number): WheelRewardsPerSector {
    type WeightedCurrencies = Map<CurrencyType, number>;
    const AddToWeightedCurrencies = (container: WeightedCurrencies, currencyType: CurrencyType, weightedCurrencyAmount: number) => {
      if (weightedCurrencyAmount > 0) {
        container.set(currencyType, (container.get(currencyType) ?? 0) + weightedCurrencyAmount);
      }
    };
    const sectorsTotalWeightedReward: WeightedCurrencies = new Map();
    for (const sector of this.m_config.sectors.range) {
      for (const payout of sector.value.payouts) {
        const weightedWin = bet * payout.pays * sector.weight;
        AddToWeightedCurrencies(sectorsTotalWeightedReward, payout.currencyType, weightedWin);
      }
    }
    const rewards: WheelRewardsPerSector = new Map();
    // all sectors but last
    const sectorsCurrentWeightedReward: WeightedCurrencies = new Map();
    for (let i = 0; i < this.m_config.sectors.range.length - 1; ++i) {
      const sector = this.m_config.sectors.range[i];
      const sectorRewards = new Currencies();
      for (const payout of sector.value.payouts) {
        const win = Math.trunc(bet * payout.pays);
        sectorRewards.Add(payout.currencyType, Math.round(win));

        const weightedWin = win * sector.weight;
        AddToWeightedCurrencies(sectorsCurrentWeightedReward, payout.currencyType, weightedWin);
      }
      rewards.set(sector.value.id, sectorRewards);
    }
    // last sector
    const lastSector = this.m_config.sectors.range[this.m_config.sectors.range.length - 1];
    const lastWeight = lastSector.weight;
    const lastSectorReward = new Currencies();
    for (const payout of lastSector.value.payouts) {
      const currencyType = payout.currencyType;
      const totalWeightedReward = sectorsTotalWeightedReward.get(currencyType)!;
      const currentWeightedReward = sectorsCurrentWeightedReward.has(currencyType) ? sectorsCurrentWeightedReward.get(currencyType)! : 0;

      const lastWin = Math.trunc((totalWeightedReward - currentWeightedReward + lastWeight - 1) / lastWeight);
      lastSectorReward.Add(currencyType, Math.round(lastWin));
    }
    rewards.set(lastSector.value.id, lastSectorReward);
    // a std::map: by sector id
    return new Map([...rewards].sort((a, b) => a[0] - b[0]));
  }

  GetMinimumCoinBet() {
    return this.m_config.minimumBet;
  }

  GetMaxAttempts() {
    return this.m_config.maxAttempts;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Round
  ////////////////////////////////////////////////////////////////////////////////

  CalculateRound(input: WheelRoundInput, rng: IRng): RoundResultOrError {
    input = input.Clone();
    try {
      this.VerifyInput(input);
      this.VerifyRng(rng);

      const visualRng = new MonteCarloEngineHat(input.visualSeed);

      const context = new Context(input, rng, visualRng);

      const result = new RoundResult();
      this.CalculateRoundInternal(context);
      for (const phase of context.phases) {
        result.m_summary.AddSummary(phase.summary);
        result.m_phases.push(phase);
      }

      const hasCreditRewards = result.m_summary.rewards.Get(Currency.Credits) > 0;
      if (!hasCreditRewards && input.roundType === RoundType.Gamble) {
        // RoundType::Gamble - consume all GambleToken-s
        result.m_overrideCurrencies.push([Currency.GambleToken, 0]);
      }

      // Prepare replay
      result.m_replay = { input, rngs: rng.GetHistory().data };

      return result;
    } catch (error) {
      const code = error instanceof RoundInputError ? RoundErrorCode.InputError
        : error instanceof RoundConfigError ? RoundErrorCode.ConfigError : RoundErrorCode.Exception;
      return new RoundError(code, (error as Error).message);
    }
  }

  RecoverRound(replay: RoundReplay): RoundResultOrError {
    const replayRng = new HistoryEngine(new ReplayEngine());
    replayRng.engine.SetNumbers(replay.rngs);

    return this.CalculateRound(replay.input as WheelRoundInput, replayRng);
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Internals
  ////////////////////////////////////////////////////////////////////////////////

  private VerifyInput(input: WheelRoundInput) {
    if (input.roundType !== this.GetRoundType()) throw new RoundInputError('input.roundType mismatch!', { input });
    if (input.bet <= 0 || input.bet < this.GetMinimumCoinBet()) throw new RoundInputError('input.bet missing!', { input });
    const betGroupFound = this.m_config.bettingGroups.some(group => group.id === input.betGroup);
    if (!betGroupFound) throw new RoundInputError('input.betGroup not found!', { input });
  }

  private VerifyRng(rng: IRng) {
    if (rng.GetHistory().data.length) throw new RoundInputError('Provided IRng was already used, which may mess up the replay logic!');
  }

  private EvaluateSectorRewards(context: Context) {
    const phase = context.phases[context.phases.length - 1];
    const bet = context.input.bet;
    phase.rewardsPerSector = this.GetWheelRewardsPerSector(bet);
  }

  private CalculateRoundInternal(context: Context) {
    if (this.m_config.sectors.range.length < 2) {
      throw new RoundConfigError('Wheel sectors must have at least 2 entries!');
    }

    // create new phase
    const phase = new WheelRoundPhase();
    context.phases.push(phase);
    phase.betGroup = context.input.betGroup;

    // evaluate the wins in Currencies
    this.EvaluateSectorRewards(context);

    // roll for a sector
    phase.stopSector = SelectRandomValue(this.m_config.sectors, context.mathRng).id;

    // calculate the rewards
    this.RewardSectors(context);
  }

  private RewardSectors(context: Context) {
    const phase = context.phases[context.phases.length - 1];
    const rewards = phase.summary.rewards;

    const bettedSectors = this.m_config.bettingGroups.find(group => group.id === context.input.betGroup)!;
    const hasWin = bettedSectors.sectorIds.includes(phase.stopSector);

    if (hasWin) {
      rewards.AddAll(phase.rewardsPerSector.get(phase.stopSector)!);
    }
  }
}
