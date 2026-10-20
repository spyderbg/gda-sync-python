// Egt::Game::AlphaFamily::ReelRoundRules (AlphaFamily/Math/Reel/ReelRoundRules.h/.cpp): the rules of a reel round,
// which calculate a round's result from its input and random numbers.

import { HistoryEngine, type IRng, MonteCarloEngineHat, ReplayEngine, RngOp } from '../../../../../engine/GameCore/Random/IRng';
import { Currencies, type CurrencyType } from '../../../../../engine/Game/Math/Common.data';
import { type Line, type Lines, RoundErrorCode, RoundType, type SymbolId } from '../Common/Common.data';
import { RoundConfigError, RoundInputError } from '../Common/Exceptions';
import { RoundError, type RoundReplay, RoundResult, type RoundResultOrError } from '../RoundResult.data';
import { ReelRoundInput } from './ReelRoundInput.data';
import { AddPhase, type ReelRoundPhase, SpinReelsPhase, TetraSpinPhase, TetraSubScreen } from './ReelRoundPhase.data';
import { ReelRoundRulesConfig } from './ReelRoundRules.data';
import { BaseReelRules, Context } from './Rules/BaseReelRules';
import { CollectorRules } from './Rules/CollectorRules';
import { CopySymbolsRules } from './Rules/CopySymbolsRules';
import { ExpandRules } from './Rules/ExpandRules';
import { HoldAndSpinTriggerRules } from './Rules/HoldAndSpinTriggerRules';
import { LineRules } from './Rules/LineRules';
import { RtpRules } from './Rules/RtpRules';
import { ScatterRules } from './Rules/ScatterRules';
import { SpinRules } from './Rules/SpinRules';
import type { Symbol } from './Rules/SpinRules.data';
import { StickSymbolsRules } from './Rules/StickSymbolsRules';
import { TetraSpinRules } from './Rules/TetraSpinRules';
import { VisualAnalyze } from './VisualAnalyse/VisualAnalyze';
import { VisualAnalyzeConfig } from './VisualAnalyse/VisualAnalyze.data';

export class ReelRoundRules extends BaseReelRules {
  private readonly m_config: ReelRoundRulesConfig;
  private readonly m_visualAnalyze: VisualAnalyze;
  private readonly m_expandRules: ExpandRules; // expand symbols
  private readonly m_lineRules: LineRules; // line analyser
  private readonly m_rtpRules: RtpRules; // rtp reducer before other features
  private readonly m_scatterRules: ScatterRules; // scatter analyser
  private readonly m_spinRules: SpinRules; // choose reelset and stop reels
  private readonly m_copySymbolsRules: CopySymbolsRules; // copy symbols from another reelstop
  private readonly m_stickSymbolsRules: StickSymbolsRules; // stick symbols per reel
  private readonly m_collectorRules: CollectorRules; // apply collector symbol
  private readonly m_tetraSpinRules: TetraSpinRules; // tetra spin rules if round is tetra
  private readonly m_holdAndSpinTriggerRules: HoldAndSpinTriggerRules; // combination rewarding hold and spin

  constructor(config: ReelRoundRulesConfig, visualConfig: VisualAnalyzeConfig) {
    super(null as unknown as ReelRoundRules);
    (this as unknown as { m_roundRules: ReelRoundRules }).m_roundRules = this;
    this.m_config = config;
    this.m_visualAnalyze = new VisualAnalyze(this, visualConfig);
    this.m_expandRules = new ExpandRules(this, config.expandConfig);
    this.m_lineRules = new LineRules(this, config.lineConfig);
    this.m_rtpRules = new RtpRules(this, config.rtpConfig);
    this.m_scatterRules = new ScatterRules(this, config.scatterConfig);
    this.m_spinRules = new SpinRules(this, config.spinConfig);
    this.m_copySymbolsRules = new CopySymbolsRules(this, config.copySymbolsConfig);
    this.m_stickSymbolsRules = new StickSymbolsRules(this, config.stickSymbolsConfig);
    this.m_collectorRules = new CollectorRules(this, config.collectorConfig);
    this.m_tetraSpinRules = new TetraSpinRules(this, config.tetraSpinConfig);
    this.m_holdAndSpinTriggerRules = new HoldAndSpinTriggerRules(this, config.holdAndSpinTriggerConfig);
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Config
  ////////////////////////////////////////////////////////////////////////////////

  GetConfig() {
    return this.m_config;
  }

  GetExpandRules() {
    return this.m_expandRules;
  }

  GetLineRules() {
    return this.m_lineRules;
  }

  GetRtpRules() {
    return this.m_rtpRules;
  }

  GetScatterRules() {
    return this.m_scatterRules;
  }

  GetSpinRules() {
    return this.m_spinRules;
  }

  GetCopySymbolsRules() {
    return this.m_copySymbolsRules;
  }

  GetStickSymbolsRules() {
    return this.m_stickSymbolsRules;
  }

  GetCollectorRules() {
    return this.m_collectorRules;
  }

  GetTetraSpinRules() {
    return this.m_tetraSpinRules;
  }

  GetVisualAnalyze() {
    return this.m_visualAnalyze;
  }

  GetRoundType(): RoundType {
    return this.m_config.roundType;
  }

  GetRowsCount() {
    return this.m_config.rowsCount;
  }

  GetReelsCount() {
    return this.m_config.fakeReels.length;
  }

  GetMinBet() {
    return this.m_config.allowedBetAmounts[0];
  }

  GetAllowedBets(minBet: number, maxBet: number) {
    return this.m_config.allowedBetAmounts.filter(bet => (!minBet || bet >= minBet) && (!maxBet || bet <= maxBet));
  }

  GetMinLines() {
    return this.m_config.allowedBetLines[0];
  }

  GetAllowedLines() {
    return [...this.m_config.allowedBetLines];
  }

  GetLineOffsets(): Lines;
  GetLineOffsets(lineId: number): Line;
  GetLineOffsets(lineId?: number) {
    return lineId === undefined ? this.m_lineRules.GetLineOffsets() : this.m_lineRules.GetLineOffsets(lineId);
  }

  EstimateValue(currencies: Currencies) {
    let estimate = 0;
    for (const [currency, amount] of currencies) estimate += amount * (this.m_config.estimateValues.get(currency) ?? 0);
    return estimate;
  }

  GetSymbolName(symbolId: SymbolId) {
    return this.GetSymbolNames()[symbolId]?.name ?? String(symbolId);
  }

  GetSymbolNames(): Symbol[] {
    const symbols = this.m_spinRules.m_config.symbols;
    if (symbols.length) return symbols;
    // Tetra rounds keep symbols on each subscreen, not on the parent spinConfig.
    const subScreens = this.m_tetraSpinRules.GetConfig().subScreens;
    return subScreens.length ? subScreens[0].spinConfig.symbols : symbols;
  }

  GetFakeReels() {
    return this.m_config.fakeReels;
  }

  HasLeftOver() {
    return this.m_config.rtpConfig.hasLeftOver;
  }

  GetLastResultSlot() {
    return this.m_config.lastResultSlot as number;
  }

  GetBetBarCurrencyType(): CurrencyType {
    return this.m_config.betBarCurrencyType;
  }

  GetMaxBetMultiplier() {
    return this.m_config.maxBetMultiplier;
  }

  GetMinBetMultiplier() {
    return this.m_config.minBetMultiplier;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Round
  ////////////////////////////////////////////////////////////////////////////////

  CalculateRound(input: ReelRoundInput, rng: IRng): RoundResultOrError {
    input = input.Clone();
    try {
      this.VerifyInput(input);
      this.VerifyRng(rng);

      if (this.GetRoundType() === RoundType.Main) {
        // Every game 1st rng is seed for Visual rng generator
        input.visualSeed = rng.Generate(RngOp.VisualDiversitySeed);
      }

      const visualRng = new MonteCarloEngineHat(input.visualSeed);
      const context = new Context(input, rng, visualRng);
      const result = new RoundResult();
      const phases = this.m_rtpRules.GetForcedResult(context)?.phases ?? (this.CalculateRoundInternal(context), context.phases);
      for (const phase of phases) {
        AddPhase(result.m_summary, phase);
        result.m_phases.push(phase);
      }

      // Prepare replay
      result.m_replay = { input, rngs: rng.GetHistory().data };
      return result;
    } catch (error) {
      const code = error instanceof RoundInputError ? RoundErrorCode.InputError
        : error instanceof RoundConfigError ? RoundErrorCode.ConfigError : RoundErrorCode.Exception;
      console.error(`ReelRoundRules: ${RoundErrorCode[code]}: ${(error as Error).message}`);
      return new RoundError(code, (error as Error).message);
    }
  }

  RecoverRound(replay: RoundReplay): RoundResultOrError {
    const replayRng = new HistoryEngine(new ReplayEngine());
    replayRng.engine.SetNumbers(replay.rngs);
    return this.CalculateRound(replay.input, replayRng);
  }

  PrepareInput(nextRoundInput: ReelRoundInput, lastRoundResult: RoundResult) {
    // Next rounds use an increment of the previous visual diversity seed
    nextRoundInput.visualSeed = (lastRoundResult.GetInput().visualSeed + 1) >>> 0;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Internals
  ////////////////////////////////////////////////////////////////////////////////

  CalculateRoundInternal(context: Context) {
    while (this.NextSpinReelsPhase(context)) {
      const phase = context.phases[context.phases.length - 1];
      // calculate based on phase type
      if (phase instanceof SpinReelsPhase) this.CalculateSpinPhase(context, phase);
      else this.CalculateTetraPhase(context, phase);
      // Summarize current phase rewards
      BaseReelRules.UpdatePhaseSummary(phase);
    }
  }

  CalculateSpinPhase(context: Context, spinPhase: SpinReelsPhase) {
    /// Reeling
    this.m_spinRules.SelectReels(context, spinPhase);
    this.m_spinRules.StopReels(context, spinPhase);
    /// Stick and Copy symbols (check the order here for other games)
    this.m_copySymbolsRules.Update(context, spinPhase);
    this.m_stickSymbolsRules.Update(context, spinPhase);
    /// Create scatter combinations (before expanding)
    this.m_scatterRules.CreateCombinations(context, spinPhase);
    /// Expand symbols
    this.m_expandRules.ExpandSymbols(context, spinPhase);
    /// Create line combinations (after expanding)
    this.m_lineRules.CreateCombinations(context, spinPhase);

    this.AddMultipliers(context, spinPhase);
    this.RewardCombinations(context, spinPhase);
    this.FilterCombinations(context, spinPhase);

    /// Filter expand symbols
    this.m_expandRules.FilterExpandSymbols(context, spinPhase);
    /// run collector
    this.m_collectorRules.Update(context, spinPhase);
    // check for hold and spin
    this.m_holdAndSpinTriggerRules.Update(context, spinPhase);
  }

  CalculateTetraPhase(context: Context, tetraPhase: TetraSpinPhase) {
    for (const subScreenRules of this.m_tetraSpinRules.m_subScreenRules) {
      const subScreen = new TetraSubScreen();
      // could be while with multiple phases
      const spinPhase = new SpinReelsPhase();
      subScreenRules.CalculateSpinPhase(context, spinPhase);
      context.gridTocopyFrom = spinPhase.stop;
      subScreen.phases.push(spinPhase);
      tetraPhase.subScreens.push(subScreen);
    }
    context.gridTocopyFrom = null;
    this.m_tetraSpinRules.Update(context, tetraPhase);
  }

  private VerifyInput(input: ReelRoundInput) {
    if (input.roundType !== this.GetRoundType()) throw new RoundInputError('input.roundType mismatch!', { input });
    const allowedBets = this.m_config.allowedBetAmounts;
    const maxBet = this.GetMaxBetMultiplier() > 0 ? input.initialMatchCreditBet * this.GetMaxBetMultiplier() : allowedBets[allowedBets.length - 1];
    const minBet = this.GetMinBetMultiplier() > 0 ? input.initialMatchCreditBet * this.GetMinBetMultiplier() : allowedBets[0];
    if (!allowedBets.includes(input.bet) || input.bet > maxBet || input.bet < minBet) throw new RoundInputError('input.bet not allowed!', { input });
    if (!this.m_config.allowedBetLines.includes(input.lines)) throw new RoundInputError('input.lines not allowed!', { input });
    if (input.lines * input.betPerLine * this.m_tetraSpinRules.GetSubScreenCount() !== input.bet) {
      throw new RoundInputError('input.betPerLine mismatch!', { input });
    }
  }

  private VerifyRng(rng: IRng) {
    if (rng.GetHistory().data.length) throw new RoundInputError('Provided IRng was already used, which may mess up the replay logic!');
  }

  private NextSpinReelsPhase(context: Context) {
    // TODO: multiple phases: end condition?
    if (context.phases.length === 1) return false;
    const newPhase: ReelRoundPhase = context.input.roundType === RoundType.Tetra ? new TetraSpinPhase() : new SpinReelsPhase();
    newPhase.animation = context.visualRng.Generate(RngOp.PhaseAnimation);
    context.phases.push(newPhase);
    return true;
  }

  private AddMultipliers(_context: Context, phase: SpinReelsPhase) {
    for (const combination of phase.combinations) combination.multipliers.MultiplyBy(this.m_config.multipliers);
    this.m_lineRules.AddMultipliers(phase);
  }

  private RewardCombinations(_context: Context, spinPhase: SpinReelsPhase) {
    this.m_lineRules.RewardCombinations(spinPhase);
    this.m_scatterRules.RewardCombinations(spinPhase);
    for (const combination of spinPhase.combinations) combination.rewards.RemoveZeroAmounts();
  }

  private FilterCombinations(_context: Context, spinPhase: SpinReelsPhase) {
    // Remove combination with empty rewards
    let combinations = spinPhase.combinations.filter(combination => !combination.rewards.empty());
    // Sort combination by (type, id), keeping the order of equal ones
    combinations = combinations.map((combination, index) => ({ combination, index }))
      .sort((a, b) => a.combination.type - b.combination.type || a.combination.id - b.combination.id || a.index - b.index)
      .map(({ combination }) => combination);
    // Of adjacent combinations with the same (type, id), keep the one with the higher rewards
    const kept: typeof combinations = [];
    for (const combination of combinations) {
      const previous = kept[kept.length - 1];
      if (previous && previous.type === combination.type && previous.id === combination.id) {
        const a = [this.EstimateValue(previous.rewards), previous.symbolCount];
        const b = [this.EstimateValue(combination.rewards), combination.symbolCount];
        const keepB = a[0] < b[0] || (a[0] === b[0] && a[1] < b[1]);
        if (keepB) kept[kept.length - 1] = combination;
      } else {
        kept.push(combination);
      }
    }
    spinPhase.combinations = kept;
  }
}
