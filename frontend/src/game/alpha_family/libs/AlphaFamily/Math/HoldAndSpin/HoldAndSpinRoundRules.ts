// Egt::Game::AlphaFamily::HoldAndSpinRoundRules (AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundRules.h/.cpp): the rules
// of a hold and spin round, which drops coins on the free positions of the trigger's stop, one spin per round.

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { HistoryEngine, type IRng, MonteCarloEngineHat, ReplayEngine } from '@game/engine/GameCore/Random/IRng';
import { EgtALogCategoryClass, EgtAError } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, ERoundTags, Multipliers, RoundErrorCode, RoundType, type SymbolGrid } from '../Common/Common.data';
import { RoundConfigError, RoundInputError } from '../Common/Exceptions';
import { SelectRandomValue, SelectValueFromIndex } from '../Common/Weighted';
import { SpinReelsPhase } from '../Reel/ReelRoundPhase.data';
import { ReelRoundInput } from '../Reel/ReelRoundInput.data';
import { BaseReelRules } from '../Reel/Rules/BaseReelRules';
import type { RoundInput } from '../RoundInput';
import type { RoundPhase } from '../RoundPhase';
import { RoundError, type RoundReplay, RoundResult, type RoundResultOrError } from '../RoundResult.data';
import { WheelRoundInput } from '../Wheel/WheelRoundInput.data';
import { HoldAndSpinRoundInput } from './HoldAndSpinRoundInput.data';
import { HoldAndSpinPhase, type HoldAndSpinPhases } from './HoldAndSpinRoundPhase.data';
import type { HoldAndSpinRoundRulesConfig } from './HoldAndSpinRoundRules.data';

export enum EMode {
  Full = 0,
  UntilDrop,
  OneSpin,
}

class Context {
  phases: HoldAndSpinPhases = [];
  spins = 0;

  constructor(readonly input: HoldAndSpinRoundInput, readonly mathRng: IRng, readonly visualRng: IRng) {
    // get spins from previous phases
    this.spins = Math.trunc(input.prevHoldAndSpinEnergy / input.bet);
  }
}

export class HoldAndSpinRoundRules {
  static readonly EMode = EMode;

  constructor(private readonly m_config: HoldAndSpinRoundRulesConfig) {}

  ////////////////////////////////////////////////////////////////////////////////
  /// Config
  ////////////////////////////////////////////////////////////////////////////////

  GetConfig() {
    return this.m_config;
  }

  GetTriggerRoundType() {
    return this.m_config.triggerRoundType;
  }

  GetFakeReels() {
    return this.m_config.fakeReels;
  }

  GetMode() {
    return EMode.OneSpin;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Round
  ////////////////////////////////////////////////////////////////////////////////

  CalculateRound(input: HoldAndSpinRoundInput, rng: IRng): RoundResultOrError {
    input = input.Clone();
    try {
      this.VerifyInput(input);
      this.VerifyRng(rng);

      const visualRng = new MonteCarloEngineHat(input.visualSeed);

      const result = new RoundResult();
      const context = new Context(input, rng, visualRng);

      this.CalculateRoundInternal(context);

      for (const phase of context.phases) {
        result.m_summary.AddSummary(phase.summary);
        result.m_phases.push(phase);
      }

      // transfer remaining spin energy to override currencies
      result.m_overrideCurrencies.push([Currency.HoldAndSpinEnergy, context.spins * input.bet]);

      // Prepare replay
      result.m_replay = { input, rngs: rng.GetHistory().data };

      return result;
    } catch (error) {
      const code = error instanceof RoundInputError ? RoundErrorCode.InputError
        : error instanceof RoundConfigError ? RoundErrorCode.ConfigError : RoundErrorCode.Exception;
      EgtAError('{}: {}', RoundErrorCode[code], (error as Error).message);
      return new RoundError(code, (error as Error).message);
    }
  }

  RecoverRound(replay: RoundReplay): RoundResultOrError {
    const replayRng = new HistoryEngine(new ReplayEngine());
    replayRng.engine.SetNumbers(replay.rngs);

    return this.CalculateRound(replay.input as HoldAndSpinRoundInput, replayRng);
  }

  PrepareInput(nextRoundInput: HoldAndSpinRoundInput, lastRoundInput: RoundInput, lastRoundPhase: RoundPhase) {
    if (lastRoundInput instanceof ReelRoundInput) {
      nextRoundInput.visualSeed = (lastRoundInput.visualSeed + 1) >>> 0;
      nextRoundInput.triggerRoundType = lastRoundInput.roundType;

      if (!(lastRoundPhase instanceof SpinReelsPhase)) {
        EgtAError('HoldAndSpinRoundRules::PrepareInput: the last phase is not a SpinReelsPhase');
        return;
      }

      const spinPhase = lastRoundPhase;
      nextRoundInput.triggerStop = spinPhase.stop.map(reel => [...reel]);
      nextRoundInput.replaceDistributionIndex = spinPhase.replaceDistributionIndex;
      nextRoundInput.prevStop = spinPhase.stop.map(reel => [...reel]);
    } else if (lastRoundInput instanceof HoldAndSpinRoundInput) {
      nextRoundInput.visualSeed = (lastRoundInput.visualSeed + 1) >>> 0;
      nextRoundInput.triggerRoundType = lastRoundInput.triggerRoundType;
      nextRoundInput.triggerStop = lastRoundInput.triggerStop.map(reel => [...reel]);
      nextRoundInput.replaceDistributionIndex = lastRoundInput.replaceDistributionIndex;

      if (!(lastRoundPhase instanceof HoldAndSpinPhase)) {
        EgtAError('HoldAndSpinRoundRules::PrepareInput: the last phase is not a HoldAndSpinPhase');
        return;
      }

      const hsPhase = lastRoundPhase;
      nextRoundInput.prevStop = hsPhase.stop.map(reel => [...reel]);
    } else if (lastRoundInput instanceof WheelRoundInput) {
      EgtAError('HoldAndSpinRoundRules::PrepareInput with WheelRoundInput not supported');
    }
  }

  GetRoundTags(result: RoundResult): ERoundTags[] {
    const tags: ERoundTags[] = [];

    // big win
    const summary = result.ForceGetSummaryWithoutRecovery();
    const creditsReward = summary.rewards.Get(Currency.Credits);
    const extraReward = summary.rewards.Get(Currency.ExtraSpinEnergy);
    const reward = Math.max(creditsReward, extraReward); // maybe use estimate values?
    const bet = result.GetBet();
    if (bet === 0) return tags;

    const winType = [...this.m_config.winTypeThresholds].sort((a, b) => a[0] - b[0]).filter(([timesBet]) => reward >= timesBet * bet);
    if (winType.length) tags.push(winType[winType.length - 1][1]);

    if (!result.m_phases.length) return tags;
    const lastRoundPhase = result.m_phases[result.m_phases.length - 1];
    if (!(lastRoundPhase instanceof HoldAndSpinPhase)) return tags;
    const stops = lastRoundPhase.stop;

    for (const symId of [...this.m_config.winTypeThresholdsPerSymbol.keys()].sort((a, b) => a - b)) {
      const symCount = BaseReelRules.CountSymbols(stops, symId);
      if (symCount === 0) continue;

      const winTypeThresholdsPerSymbol = this.m_config.winTypeThresholdsPerSymbol.get(symId)!;
      const winTypePerSym = [...winTypeThresholdsPerSymbol].sort((a, b) => a[0] - b[0]).filter(([count]) => symCount >= count);
      if (winTypePerSym.length) tags.push(winTypePerSym[winTypePerSym.length - 1][1]);
    }
    // near miss

    return tags;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Internals
  ////////////////////////////////////////////////////////////////////////////////

  private CalculateRoundInternal(context: Context) {
    // hold and spin
    while (context.spins > 0) {
      context.spins--;

      this.AddNewPhase(context);
      this.DropSymbols(context);
      this.ReplaceSymbols(context);
      this.AddWinFigureInfo(context);

      // optional partial hold and spin
      if (this.GetMode() === EMode.OneSpin) break;
      if (this.GetMode() === EMode.UntilDrop && context.spins === this.m_config.initialSpins) break;
    }

    // collect rewards if finished
    this.CollectRewards(context);
  }

  private VerifyInput(input: HoldAndSpinRoundInput) {
    if (input.roundType !== RoundType.HoldAndSpin) throw new RoundInputError('input.roundType mismatch!', { input });
    if (input.triggerRoundType !== this.GetTriggerRoundType()) throw new RoundInputError('input.triggerRoundType mismatch!', { input });
    if (input.bet <= 0) throw new RoundInputError('input.bet missing!', { input });
    if (input.prevHoldAndSpinEnergy < input.bet) throw new RoundInputError('input.prevHoldAndSpinEnergy mismatch!', { input });
    if (!input.triggerStop.length) throw new RoundInputError('input.triggerStop missing from spin phase!', { input });
    if (!input.prevStop.length) throw new RoundInputError('input.prevStop missing from hs phase!', { input });
  }

  private VerifyRng(rng: IRng) {
    if (rng.GetHistory().data.length) throw new RoundInputError('Provided IRng was already used, which may mess up the replay logic!');
  }

  private AddNewPhase(context: Context) {
    const phases = context.phases;

    const newPhase = new HoldAndSpinPhase();

    if (!phases.length) {
      newPhase.stop = context.input.prevStop.map(reel => [...reel]);
    } else {
      newPhase.stop = phases[phases.length - 1].stop.map(reel => [...reel]);
    }

    phases.push(newPhase);
  }

  private DropSymbols(context: Context) {
    // get current phase stop
    const phase = context.phases[context.phases.length - 1];
    const stop = phase.stop;
    let freePositions = 0;

    for (const reel of stop) {
      for (let row = 0; row < reel.length; row++) {
        // look for free pos
        if (this.m_config.triggerSymbolIds.includes(reel[row])) continue;

        // roll for drop
        const drop = SelectRandomValue(this.m_config.dropDistribution, context.mathRng);

        if (drop) {
          reel[row] = this.m_config.dropSymbolId;

          // reset spin count
          context.spins = this.m_config.initialSpins;
        } else {
          reel[row] = SelectRandomValue(this.m_config.fakeDrops, context.visualRng);

          // no drop
          freePositions++;
        }
      }
    }

    // early finish
    if (freePositions === 0) {
      context.spins = 0;
    }
  }

  private ReplaceSymbols(context: Context) {
    const index = context.input.replaceDistributionIndex;
    const distribution = SelectValueFromIndex(this.m_config.replaceMaps, index);

    const triggerStop = context.input.triggerStop;
    const stop = context.phases[context.phases.length - 1].stop;

    BaseReelRules.ReplaceSymbols(stop, triggerStop, distribution, context.mathRng);
  }

  private AddWinFigureInfo(context: Context) {
    const phase = context.phases[context.phases.length - 1];

    phase.winFiguresInfo = BaseReelRules.GetAllCoordinates(phase.stop, this.m_config.triggerSymbolIds);
  }

  private CollectRewards(context: Context) {
    const phase = context.phases[context.phases.length - 1];
    const bet = context.input.bet;

    const getRewards = (stop: SymbolGrid) => {
      const rewards = new Currencies();

      for (const payTableIt of this.m_config.paytable) {
        for (const symbolId of payTableIt.symbolCountPayout.keys()) {
          const count = BaseReelRules.CountSymbols(stop, symbolId);
          payTableIt.Payout(bet, symbolId, count, Multipliers.One, rewards);
        }
      }

      return rewards;
    };

    const currRewards = getRewards(phase.stop);
    const prevRewards = getRewards(context.input.prevStop);

    phase.summary.rewards.AddAll(currRewards.Minus(prevRewards));
  }
}

EgtALogCategoryClass(HoldAndSpinRoundRules, 'HoldAndSpinRoundRules');
