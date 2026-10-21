// Egt::Game::AlphaFamily::ReelRoundPresentingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundPresenting):
// shows each phase's symbols, combinations, lines and win, and ends the round once the win is counted.

import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import {
  IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IDecreaseBetHwButton, IExitHwButton, IGambleBlackHwButton, IGambleHwButton, IGambleRedHwButton,
  IIncreaseBetHwButton, IInfoHwButton, IMaxBetHwButton, IStartHwButton, HwButtonLight,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { get_if, type int } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, PayoutSummary, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { SpinReelsPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import type { RoundPhases } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IReelRound, IReelRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import {
  ICoinsWinBarView, ICreditBarView, ICreditsWinBarView, IExtraSpinBarView, IHoldAndSpinBarView,
} from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBigWinInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IBigWinInfoView.bridge';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IBigWinView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { ReelRoundPresentingStatics, ReelRoundPresentingStorage, ReelRoundStatics, ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundPresentingState extends State {
  static Interfaces = [IReelRoundPresenting];
  static Nvrams = [ReelRoundPresentingStorage];
  static Statics = [ReelRoundPresentingStatics];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AtachCallbacks();

    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    const phases = roundResult.GetPhases();

    this.Parent(IViewManager).SetupViews(roundResult, { showInitialStop: true, enableFastForwardCollect: true });

    if (phases.length !== 0) {
      const statics = this.Static(ReelRoundPresentingStatics);
      statics.phaseIdx = 0;
      statics.HasPendingRoundEnd = false;
      statics.HasAccumulatedReward = false;
      statics.HasSymbolsExpanded = false;
      statics.HasShowedFastLines = false;

      this.CheckGroupStackedSymbolsAnimation();
      this.ShowPhase();
    } else {
      this.TransitLater(this.ToRoundEnding());
    }
  }

  abstract ToRoundEnding(): Reaction;

  private AtachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IReelsView.Events).symbolsExpanded, this.OnSymbolsExpanded);

    this.ReactOn(this.RuntimeGetConst(IBigWinView.Events).animatingDone, this.OnBigWinAnimatingDone);

    const coinsBarViewEvents = this.RuntimeTryGetConst(ICoinsWinBarView.Events);
    if (coinsBarViewEvents) {
      this.ReactOn(coinsBarViewEvents.animatingDone, this.OnWinAccumulationFinished);
    }

    const creditWinBar = this.RuntimeTryGetConst(ICreditsWinBarView.Events);
    if (creditWinBar) {
      this.ReactOn(creditWinBar.animatingDone, this.OnWinAccumulationFinished);
    }

    const linesViewEvents = this.RuntimeTryGetConst(ILinesView.Events);
    if (linesViewEvents) {
      this.ReactOn(linesViewEvents.showFastLinesFinished, this.OnShowFastLinesFinished);
    }

    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHWButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IIncreaseBetHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IDecreaseBetHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IMaxBetHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.OnAutoPlayHwButtonPressed);
  }

  private ApplyCapping(phases: RoundPhases, summary: PayoutSummary) {
    summary = summary.Clone(); // C++ takes it by value
    const winCapping = this.RuntimeGetConst(ILimits).GetWinCapping();
    if (winCapping.capping <= 0) return summary; // no capping
    if (!winCapping.capValueWinBar) return summary; // no need to cap win bar value

    const gameflow = this.RuntimeGetConst(IGameflow);
    const available = gameflow.GetMatchCurrenciesAvailable().Clone();
    const phaseIdx = this.Static(ReelRoundPresentingStatics).phaseIdx;

    // sum rewards up to phaseIdx
    for (let i: int = 0; i < phaseIdx; i++) {
      if (AssertIf(!IsValidIndex(phases, i))) break;
      available.AddAll(phases[i].summary.rewards);
    }

    // check credits cap
    if (available.Get(Currency.Credits) + summary.rewards.Get(Currency.Credits) > winCapping.capping) {
      // we cap the win that hits the cap for the correct behaviour for the win bars
      const capWin = winCapping.capping - available.Get(Currency.Credits);

      summary.rewards.Set(Currency.Credits, capWin);
    }

    // check coin cap
    const mathRules = this.RuntimeGetConst(IMathRules);

    if (mathRules.HasWheelRoundRules(RoundType.Wheel)) {
      const wheelRules = mathRules.GetWheelRoundRules(RoundType.Wheel);
      const coinCapping = wheelRules.GetCoinCapping(winCapping.capping);

      if (available.Get(Currency.CoinsSpinEnergy) + summary.rewards.Get(Currency.CoinsSpinEnergy) > coinCapping) {
        summary.rewards.Set(Currency.CoinsSpinEnergy, coinCapping);
      }
    }

    return summary;
  }

  protected CheckBigWin() {
    if (this.Parent(IGameManager).IsAutoPlayOn()) return;

    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    const roundRules = this.Parent(IReelRound).GetRoundRules();
    const va = roundRules.GetVisualAnalyze();
    const tags = va.GetRoundTags(roundResult);

    if (tags.length !== 0) {
      this.RuntimeGet(IBigWinView).ShowAnimation(tags[0]);
      const bigWinUnfoldedView = this.RuntimeTryGet(IBigWinInfoView);
      if (bigWinUnfoldedView) {
        bigWinUnfoldedView.ShowAnimation(tags[tags.length - 1]);
      }
    }
    this.RuntimeGet(ILinesView).SetWinLineTags(tags);
  }

  private CheckGroupStackedSymbolsAnimation() {
    const phaseIdx = this.Static(ReelRoundPresentingStatics).phaseIdx;
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult;
    if (AssertIf(!roundResult)) return;

    const phases = roundResult!.GetPhases();
    if (AssertIf(!IsValidIndex(phases, phaseIdx))) return;

    let phase = get_if(SpinReelsPhase, phases[phaseIdx]);
    if (AssertIf(phase === null)) return;

    const roundRules = this.Parent(IReelRound).GetRoundRules();
    const va = roundRules.GetVisualAnalyze();

    // Check all special anim, ex. stacking
    let stackedFigures = va.GetGroupStackedSymbols(phase!.combinations);

    this.RuntimeGet(IWinFiguresView).SetStackedFigures(stackedFigures);
  }

  private ShowPhase() {
    const phaseIdx = this.Static(ReelRoundPresentingStatics).phaseIdx;
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult;
    if (AssertIf(!roundResult)) return;

    const phases = roundResult!.GetPhases();
    if (AssertIf(!IsValidIndex(phases, phaseIdx))) return;

    const phase = get_if(SpinReelsPhase, phases[phaseIdx]);
    if (phase) {
      // expand symbols (then update numeric bars and show combinations)
      this.RuntimeGet(IReelsView).ShowSymbolsExpanding(phase.initialStop, phase.stop);
      this.Static(ReelRoundPresentingStatics).HasSymbolsExpanded = false;
      this.RefreshHWButtons(false);
    } else {
      // TODO: show other phase wins?
      this.NextPhase();
    }
  }

  private ShowCombinations() {
    const phaseIdx = this.Static(ReelRoundPresentingStatics).phaseIdx;
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult;
    if (AssertIf(!roundResult)) return;

    const phases = roundResult!.GetPhases();
    if (AssertIf(!IsValidIndex(phases, phaseIdx))) return;

    const phase = get_if(SpinReelsPhase, phases[phaseIdx]);
    if (AssertIf(phase === null)) return;

    if (phase!.combinations.length === 0) {
      this.Static(ReelRoundPresentingStatics).HasAccumulatedReward = true;
      this.Static(ReelRoundPresentingStatics).HasShowedFastLines = true;

      this.NextPhase();
      return;
    }

    const summary = this.ApplyCapping(phases, phase!.summary);

    const winbar = this.RuntimeTryGet(ICreditsWinBarView);
    if (winbar) {
      winbar.AddWinResult(summary);
    }
    const coinsWinBar = this.RuntimeTryGet(ICoinsWinBarView);
    if (coinsWinBar) {
      coinsWinBar.AddWinResult(summary);
    }
    const extraSpinBarView = this.RuntimeTryGet(IExtraSpinBarView);
    if (extraSpinBarView) {
      extraSpinBarView.AddWinResult(summary);
    }
    const holdAndSpinBarView = this.RuntimeTryGet(IHoldAndSpinBarView);
    if (holdAndSpinBarView) {
      holdAndSpinBarView.SetBet(roundResult!.GetBet());
      holdAndSpinBarView.AddWinResult(summary);
    }

    if (summary.rewards.Get(Currency.CoinsSpinEnergy) > 0) {
      const creditsBarView = this.RuntimeTryGet(ICreditBarView);
      if (creditsBarView) {
        creditsBarView.Minimize(false);
      }
    }

    this.CheckBigWin();

    // show fast combinations
    const combinations = phase!.combinations;
    this.RuntimeGet(IStatusLineView).ShowCombinations(combinations, true);
    this.RuntimeGet(IInfoView).ShowCombinations(combinations);
    this.RuntimeGet(IWinFiguresView).ShowCombinations(combinations, false);

    const autoPlayEnabled = this.Parent(IGameManager).IsAutoPlayOn();
    this.RuntimeGet(ILinesView).ShowCombinations(combinations, true, autoPlayEnabled);
    this.RuntimeGet(ILinesView).SetVisible(true);

    // hide symbols from underneath
    this.RuntimeGet(IReelsView).ShowCombinations(combinations);

    this.RefreshHWButtons(true);

    this.NextPhase();
  }

  private NextPhase() {
    const statics = this.Static(ReelRoundPresentingStatics);
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult;
    const phases = roundResult!.GetPhases();

    if (IsValidIndex(phases, statics.phaseIdx + 1)) {
      ++statics.phaseIdx;
      this.ShowPhase();
    } else {
      this.TryTransitToRoundEnding();
    }
  }

  private TryTransitToRoundEnding() {
    const staticStatistics = this.Static(ReelRoundPresentingStatics);

    if (!staticStatistics.HasSymbolsExpanded) return;
    if (!staticStatistics.HasAccumulatedReward) return;

    if (this.ConstStatic(ReelRoundStatics).showFastLines) {
      if (!staticStatistics.HasShowedFastLines) return;
    }

    if (staticStatistics.HasPendingRoundEnd) return;
    staticStatistics.HasPendingRoundEnd = true;

    // TODO: check if big win needs to be cleared here or elsewhere
    this.RuntimeGet(IBigWinView).Clear();

    this.TransitLater(this.ToRoundEnding());
  }

  private FastForwardBars() {
    const coinsBarView = this.RuntimeTryGet(ICoinsWinBarView);
    if (coinsBarView) {
      coinsBarView.FastForward();
    }

    const creditsBarWin = this.RuntimeTryGet(ICreditsWinBarView);
    if (creditsBarWin) {
      creditsBarWin.FastForward();
    }
  }

  protected RefreshHWButtons(enable: boolean) {
    // conditional
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.On });
    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.On });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.On });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.On });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.On });
    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.On });

    // disabled
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleRedHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleBlackHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: false });
  }

  private OnSymbolsExpanded() {
    this.Static(ReelRoundPresentingStatics).HasSymbolsExpanded = true;

    const phaseIdx = this.Static(ReelRoundPresentingStatics).phaseIdx;
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult;
    const phases = roundResult!.GetPhases();
    const phase = get_if(SpinReelsPhase, phases[phaseIdx]);
    const reelsView = this.RuntimeGet(IReelsView);

    if (phase !== null) {
      reelsView.SetStopFigures(phase.stop);
      reelsView.ShowStopFigures();
    }

    this.ShowCombinations();
    reelsView.ClearExpandSymbols();

    return this.Consume();
  }

  private OnBigWinAnimatingDone() {
    return this.Skip();
  }

  private OnWinAccumulationFinished(_value: number) {
    if (_value === 0) return this.Skip();
    this.Static(ReelRoundPresentingStatics).HasAccumulatedReward = true;
    this.TryTransitToRoundEnding();

    return this.Forward();
  }

  private FastForwardRewardAccumulation() {
    this.FastForwardBars();

    this.Static(ReelRoundPresentingStatics).HasAccumulatedReward = true;
    this.TryTransitToRoundEnding();

    return this.Forward();
  }

  private OnStartHWButtonPressed() {
    this.FastForwardBars();

    this.Static(ReelRoundPresentingStatics).HasAccumulatedReward = true;
    this.TryTransitToRoundEnding();
    this.RuntimeGet(ILinesView).StopAllSounds();

    return this.Forward();
  }

  private OnAutoPlayHwButtonPressed() {
    if (this.ConstStatic(ReelRoundStatics).showFastLines) {
      this.Static(ReelRoundStatics).showFastLines = false;
      this.RuntimeGet(ILinesView).UpdateShownCombinations(false);
      /// Forwarding this event will disable Auto-Play in GameManager.
      return this.Forward();
    } else {
      this.FastForwardRewardAccumulation();
      return this.Consume();
    }
  }

  private OnShowFastLinesFinished() {
    if (!this.ConstStatic(ReelRoundStatics).showFastLines) return this.Reject();
    if (this.ConstStatic(ReelRoundPresentingStatics).HasShowedFastLines) return this.Reject();

    this.Static(ReelRoundStatics).showFastLines = false;
    this.Static(ReelRoundPresentingStatics).HasShowedFastLines = true;
    this.Static(ReelRoundPresentingStatics).HasAccumulatedReward = true;

    this.FastForwardBars();

    this.TryTransitToRoundEnding();
    return this.Consume();
  }
}

EgtALogCategoryClass(ReelRoundPresentingState, 'ReelRoundPresentingState');
