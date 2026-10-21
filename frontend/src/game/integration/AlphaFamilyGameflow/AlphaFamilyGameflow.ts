// Egt::Integration::AlphaFamily::AlphaFamilyGameflow (integration/libs/src/Egt/AlphaFamilyGameflow): provides IGameflow,
// the match and its rounds with the kernel. A match's wallet keeps its currencies: starting it rewards MainSpinEnergy of
// the bet, which the main round consumes; rounds reward credits, which tetra rounds consume; the credits left are paid
// at its end. The next round is the one whose currency the match has (GetNextRoundType), or a tetra round while the
// match has credits for it (CheckTetraRound).

import { Currencies, type CurrencyType } from '@game/engine/Game/Math/Common.data';
import { HistoryEngine, type IRng, MonteCarloEngine, type RngNumber, type RngOp, type RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ECapTiming, ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IMathTypes } from '@game/engine/Game/RuntimeExport/IMathTypes';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { Currency, RoundErrorCode, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { RoundError, RoundResult, type CappingInfo, type RoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { type IGameflow, IGameflow as IGameflowToken, IGameflowEvents } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import type { EndMatchRequest, EndRoundRequest, StartMatchRequest, StartRoundRequest } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IKernelIntegration } from '@game/integration/BrowserKernel/IKernelIntegration';

const RngBatchCount = 64;

interface ConsecutiveRoundInfo {
  roundType: RoundType;
  available: Currencies; // available for this consecutive round session
  consumed: Currencies; // consumed for this consecutive round session
  count: number; // number of consecutive rounds of this type
}

interface Match {
  creditBet: number;
  kernelStarted: boolean;
  cappingInfo: CappingInfo | null; // capping info from round even after it ended
  consecutives: ConsecutiveRoundInfo[];
  wallet: { rewarded: Currencies; consumed: Currencies; blocked: Currencies };
}

interface Round {
  input: RoundInput;
  result: RoundResult | null;
  kernelStarted: boolean;
  kernelOutcome: boolean;
  showFastLines: boolean;
}

class InsufficientRandomBits extends Error {}

/** The kernel's random numbers as an engine: it runs out, and asks for more, when the round needs more. */
class KernelNumbersEngine implements IRng {
  private index = 0;

  constructor(private readonly numbers: number[]) {}

  Generate(_op: RngOp, range = 0) {
    const limit = range ? 0x1_0000_0000 - (0x1_0000_0000 % range) : 0x1_0000_0000;
    for (;;) {
      if (this.index >= this.numbers.length) throw new InsufficientRandomBits();
      const value = this.numbers[this.index++];
      if (value < limit) return range ? value % range : value;
    }
  }

  GetHistory(): RngSequence {
    return { data: [] };
  }
}

/** A condition the next round's result must meet, as the C++ RNG presets force outcomes for development. */
export interface RoundPreset {
  roundType: RoundType;
  name: string;
  condition: (result: RoundResult) => boolean;
}

export class AlphaFamilyGameflow extends BaseModule implements IGameflow {
  private readonly m_events = new IGameflowEvents();
  private match: Match | null = null;
  private round: Round | null = null;
  private numbers: number[] = [];
  private preset: RoundPreset | null = null;
  /** The rounds played, newest last, for the page's history. */
  readonly history: { roundType: RoundType; bet: number; win: number; rngs: RngNumber[] }[] = [];

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.RuntimeAdd(IGameflowToken, this);
    this.RuntimeAdd(IGameflowToken.Events, this.m_events);
    const kernel = this.RuntimeGet(IKernelIntegration.Events);
    kernel.startMatchReply.RegisterInstant(this, success => this.OnKernelStartMatchReply(success));
    kernel.startRoundReply.RegisterInstant(this, () => this.OnKernelStartRoundReply());
    kernel.randomsReply.RegisterInstant(this, randoms => this.OnKernelRandomsReply(randoms));
    kernel.roundOutcomeReply.RegisterInstant(this, () => this.OnKernelRoundOutcomeReply());
    kernel.endMatchReply.RegisterInstant(this, netWin => this.OnKernelEndMatchReply(netWin));
    return true;
  }

  Deinit() {
    const kernel = this.RuntimeTryGet(IKernelIntegration.Events);
    if (kernel) for (const event of Object.values(kernel)) event.Unregister(this);
    this.RuntimeRemove(IGameflowToken);
    this.RuntimeRemove(IGameflowToken.Events);
    super.Deinit();
  }

  private Kernel() {
    return this.RuntimeGet(IKernelIntegration).GetKernelApi();
  }

  /** Forces the next round of a type to meet a condition (development only). */
  SetRoundPreset(preset: RoundPreset | null) {
    this.preset = preset;
  }

  GetRoundPreset() {
    return this.preset;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Start Match
  ////////////////////////////////////////////////////////////////////////////////

  RequestStartMatch(request: StartMatchRequest) {
    /// Create match
    this.match = {
      creditBet: request.bet, kernelStarted: false, cappingInfo: null, consecutives: [],
      wallet: { rewarded: new Currencies(), consumed: new Currencies(), blocked: new Currencies() },
    };
    this.Kernel().RequestStartMatch(request.bet);
  }

  private OnKernelStartMatchReply(success: boolean) {
    const match = this.match;
    if (!match) return;
    if (success) {
      match.kernelStarted = true;
      // Starting a match rewards you energy that is consumed when starting a Main round
      match.wallet.rewarded.Add(Currency.MainSpinEnergy, match.creditBet);
    } else {
      this.match = null;
    }
    this.m_events.startMatchReply.Post({ approved: success, bet: match.creditBet });
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Start Round
  ////////////////////////////////////////////////////////////////////////////////

  RequestStartRound(request: StartRoundRequest) {
    if (!this.match?.kernelStarted) throw new Error('RequestStartRound: match not started');
    if (this.round) throw new Error('RequestStartRound: round already exists');
    if (!this.HasMatchCurrenciesAvailable(request.roundInput.consume)) throw new Error('Insufficient match currencies');
    this.round = { input: request.roundInput.Clone(), result: null, kernelStarted: false, kernelOutcome: false, showFastLines: request.showFastLines };
    // blocking the currencies that will be used for starting the round
    this.match.wallet.blocked.AddAll(this.round.input.consume);
    this.Kernel().RequestStartRound(this.RuntimeGetConst(IMathTypes).GetRoundTypeName(this.round.input.roundType));
  }

  private OnKernelStartRoundReply() {
    const round = this.round!;
    const match = this.match!;
    round.kernelStarted = true;
    this.CheckConsecutiveRoundStart();
    match.wallet.consumed.AddAll(round.input.consume);
    match.wallet.blocked.SubtractAll(round.input.consume);
    this.numbers = [];
    this.Kernel().RequestRandoms(RngBatchCount);
  }

  private OnKernelRandomsReply(randoms: number[]) {
    // Kernel can send more or less numbers than requested, we will use them all and ask for more when we run out.
    this.numbers.push(...randoms);
    this.CalculateRoundResult();
  }

  private CalculateRoundResult() {
    const round = this.round!;
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(round.input.roundType);
    let resultOrError;
    if (this.preset && this.preset.roundType === round.input.roundType) {
      resultOrError = this.CalculatePresetRound(this.preset);
      this.preset = null;
    } else {
      // A thrown InsufficientRandomBits comes back as an error: the round asks the kernel for more numbers and retries.
      const engine = new KernelNumbersEngine(this.numbers);
      const rng = new HistoryEngine(engine);
      const generate = engine.Generate.bind(engine);
      let insufficient = false;
      engine.Generate = (op, range) => {
        try {
          return generate(op, range);
        } catch (error) {
          if (error instanceof InsufficientRandomBits) insufficient = true;
          throw error;
        }
      };
      resultOrError = rules.CalculateRound(round.input, rng);
      if (insufficient) {
        this.Kernel().RequestRandoms(RngBatchCount);
        return;
      }
    }
    if (resultOrError instanceof RoundError) {
      throw new Error(`CalculateRound failed! code=${RoundErrorCode[resultOrError.code]}, message=${resultOrError.message}`);
    }
    round.result = resultOrError;
    this.ApplyCapping(round.result, ECapTiming.BeforeRoundOutcome);
    this.Kernel().RequestRoundOutcome(round.result.GetSummary().rewards.Get(Currency.Credits));
  }

  private CalculatePresetRound(preset: RoundPreset) {
    const round = this.round!;
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(round.input.roundType);
    let last = null;
    for (let attempt = 0; attempt < 200_000; attempt++) {
      const result = rules.CalculateRound(round.input, new HistoryEngine(new MonteCarloEngine()));
      if (!(result instanceof RoundResult)) return result;
      last = result;
      if (preset.condition(result)) return result;
    }
    console.warn(`AlphaFamilyGameflow: no round met the preset "${preset.name}"`);
    return last!;
  }

  private OnKernelRoundOutcomeReply() {
    const round = this.round!;
    round.kernelOutcome = true;
    const result = round.result!;
    this.history.push({ roundType: result.GetRoundType(), bet: result.GetBet(), win: result.GetSummary().rewards.Get(Currency.Credits), rngs: result.m_replay.rngs });
    if (this.history.length > 100) this.history.shift();
    /// Finaly complete the round
    this.m_events.startRoundReply.Post({ roundResult: result, showFastLines: round.showFastLines });
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// End Round
  ////////////////////////////////////////////////////////////////////////////////

  RequestEndRound(_request: EndRoundRequest) {
    const round = this.round;
    if (!round?.kernelOutcome) throw new Error('RequestEndRound: round not approved');
    /// Transfer round rewards to match wallet
    this.ApplyCapping(round.result!, ECapTiming.AfterRoundOutcome);
    const summary = round.result!.GetSummary();
    const wallet = this.match!.wallet;
    wallet.rewarded.AddAll(summary.rewards);
    round.result!.ApplyOverride(wallet.rewarded, wallet.consumed);
    // add info for consecutive rounds
    this.AddConsecutiveRoundEndRewards(summary.rewards);
    /// Destroy round
    this.round = null;
    this.m_events.endRoundReply.Post({});
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// End Match
  ////////////////////////////////////////////////////////////////////////////////

  RequestEndMatch(_request: EndMatchRequest) {
    if (this.round) throw new Error('RequestEndMatch: round not ended');
    if (!this.match?.kernelStarted) throw new Error('RequestEndMatch: match not started');
    this.Kernel().RequestEndMatch(this.GetMatchCurrenciesAvailable().Get(Currency.Credits));
  }

  private OnKernelEndMatchReply(netWinAfterTaxes: number) {
    /// Destroy match
    this.match = null;
    this.m_events.endMatchReply.Post({ totalMatchWin: netWinAfterTaxes });
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Helpers
  ////////////////////////////////////////////////////////////////////////////////

  IsIdle() {
    return !this.match;
  }

  IsMatchStarting() {
    return !!this.match && !this.match.kernelStarted;
  }

  IsMatchStarted() {
    return !!this.match?.kernelStarted;
  }

  IsRoundStarted() {
    return !!this.round?.kernelOutcome;
  }

  IsRoundStarting() {
    return !!this.round && !this.round.kernelOutcome;
  }

  private get wallet() {
    return this.match?.wallet ?? { rewarded: new Currencies(), consumed: new Currencies(), blocked: new Currencies() };
  }

  GetMatchCurrencyRewarded(type: CurrencyType) {
    return this.wallet.rewarded.Get(type);
  }

  GetMatchCurrencyConsumed(type: CurrencyType) {
    return this.wallet.consumed.Get(type) + this.wallet.blocked.Get(type);
  }

  GetMatchCurrencyAvailable(type: CurrencyType) {
    return this.wallet.rewarded.Get(type) - this.wallet.consumed.Get(type) - this.wallet.blocked.Get(type);
  }

  GetMatchCurrenciesRewarded() {
    return this.wallet.rewarded.Clone();
  }

  GetMatchCurrenciesConsumed() {
    return this.wallet.consumed.Plus(this.wallet.blocked);
  }

  GetMatchCurrenciesAvailable() {
    return this.wallet.rewarded.Minus(this.wallet.consumed).SubtractAll(this.wallet.blocked);
  }

  GetMatchCurrenciesAvailableTotal() {
    return this.wallet.rewarded.Minus(this.wallet.consumed);
  }

  HasMatchCurrenciesAvailable(required: Currencies) {
    const available = this.GetMatchCurrenciesAvailable();
    return [...required].every(([type, amount]) => amount >= 0 && amount <= available.Get(type));
  }

  GetConsecutiveRoundAvailable(type: CurrencyType) {
    const consecutives = this.match?.consecutives ?? [];
    return consecutives.length ? consecutives[consecutives.length - 1].available.Get(type) : 0;
  }

  GetConsecutiveRoundConsumed(type: CurrencyType) {
    const consecutives = this.match?.consecutives ?? [];
    return consecutives.length ? consecutives[consecutives.length - 1].consumed.Get(type) : 0;
  }

  GetConsecutiveTriggerRoundType() {
    const consecutives = this.match?.consecutives ?? [];
    // which round type triggered the current consecutive rounds
    return consecutives.length < 2 ? RoundType.Undefined : consecutives[consecutives.length - 2].roundType;
  }

  GetInitialCreditsBet() {
    return this.match?.creditBet ?? 0;
  }

  GetLastConsecutiveRoundCount(roundType?: RoundType) {
    const consecutives = this.match?.consecutives ?? [];
    const last = consecutives[consecutives.length - 1];
    if (!last) return 0;
    if (roundType !== undefined && last.roundType !== roundType) return 0;
    return last.count;
  }

  private CheckConsecutiveRoundStart() {
    const priorities = this.RuntimeGetConst(IMathRules).GetConsecutiveRoundTypePriorities();
    const getPrio = (roundType: RoundType) => priorities.get(roundType) ?? 0;
    const consecutives = this.match!.consecutives;
    const round = this.round!;
    const available = this.GetMatchCurrenciesAvailableTotal();
    const roundType = round.input.roundType;
    while (consecutives.length && consecutives[consecutives.length - 1].roundType !== roundType
      && getPrio(consecutives[consecutives.length - 1].roundType) >= getPrio(roundType)) {
      consecutives.pop();
    }
    const last = consecutives[consecutives.length - 1];
    if (last && last.roundType === roundType) {
      last.consumed.AddAll(round.input.consume);
      last.count++;
    } else {
      consecutives.push({ roundType, available, consumed: round.input.consume.Clone(), count: 1 });
    }
  }

  private AddConsecutiveRoundEndRewards(rewards: Currencies) {
    for (const info of this.match!.consecutives) info.available.AddAll(rewards);
  }

  private ApplyCapping(result: RoundResult, timing: ECapTiming) {
    const winCapping = this.RuntimeGetConst(ILimits).GetWinCapping();
    if (timing !== winCapping.capTiming || winCapping.capping <= 0) return;
    const caps = new Currencies(Currency.Credits, winCapping.capping);
    result.CalculateAndApplyCapping(this.GetMatchCurrenciesAvailable(), caps);
    if (!result.m_cappingInfo) return;
    this.UpdateRemainingFeaturesInfo(result);
    this.ApplyCappingToMatchCurrencies(result);
  }

  private ApplyCappingToMatchCurrencies(result: RoundResult) {
    // copy capping info to match too
    if (result.m_cappingInfo) this.match!.cappingInfo = { ...result.m_cappingInfo };
  }

  /** Whether the cap ends features the match still has: its other currencies, or the tetra round it was in. The browser
   * game has no wheel, so no forced wheel. */
  private UpdateRemainingFeaturesInfo(result: RoundResult) {
    const cappingInfo = result.m_cappingInfo!;
    const creditHit = cappingInfo.cappedCurrencies.some(([type]) => type === Currency.Credits);
    if (!creditHit) return;
    const available = this.GetMatchCurrenciesAvailable();
    const hasNonCredit = [...available].some(([type]) => type !== Currency.Credits && type !== Currency.WheelToken && type !== Currency.GambleToken);
    const isTetraRound = result.GetRoundType() === RoundType.Tetra;
    cappingInfo.remainingFeatures = hasNonCredit || isTetraRound;
  }

  private CheckTetraRound(available: Currencies) {
    const mathRules = this.RuntimeGetConst(IMathRules);
    if (!mathRules.HasReelRoundRules(RoundType.Tetra)) return false;
    const match = this.match;
    if (!match || !match.consecutives.length) return false;
    const lastCons = match.consecutives[match.consecutives.length - 1];
    const roundRules = mathRules.GetReelRoundRules(RoundType.Tetra);
    const tetraRules = roundRules.GetTetraSpinRules();
    const availableCredits = available.Get(Currency.Credits);
    if (lastCons.count >= tetraRules.GetTetraMaxRounds()) return false;
    if (availableCredits < roundRules.GetMinBetMultiplier() * match.creditBet) return false;
    if (availableCredits >= tetraRules.GetTetraTriggerTimesBet() * match.creditBet) return true;
    return lastCons.roundType === RoundType.Tetra;
  }

  IsForcedWheel() {
    return false;
  }

  IsCappingHit() {
    return !!this.match?.cappingInfo;
  }

  HasRemainingFeaturesOnCap() {
    return !!this.match?.cappingInfo?.remainingFeatures;
  }

  GetNextRoundType() {
    const available = this.GetMatchCurrenciesAvailable();
    if (available.Get(Currency.HoldAndSpinEnergy) > 0) return RoundType.HoldAndSpin;
    if (available.Get(Currency.FreeSpinEnergy) > 0) return RoundType.Free;
    if (available.Get(Currency.ExtraFreeSpinEnergy) > 0) return RoundType.ExtraFree;
    if (available.Get(Currency.CoinsFreeSpinEnergy) > 0) return RoundType.CoinsFree;
    if (available.Get(Currency.ExtraSpinEnergy) > 0) return RoundType.Extra;
    if (available.Get(Currency.CoinsSpinEnergy) > 0) return RoundType.Coins;
    if (available.Get(Currency.MainSpinEnergy) > 0) return RoundType.Main;
    if (this.CheckTetraRound(available)) return RoundType.Tetra;
    return RoundType.Undefined;
  }

  /** The match's wallet, for the page's debug panel. */
  GetMatchSnapshot() {
    const match = this.match;
    return match ? {
      creditBet: match.creditBet, available: this.GetMatchCurrenciesAvailable().toJSON(), rewarded: match.wallet.rewarded.toJSON(),
      consumed: match.wallet.consumed.toJSON(), consecutives: match.consecutives.map(item => ({ roundType: RoundType[item.roundType], count: item.count })),
    } : null;
  }
}
