// Egt::Game::AlphaFamily::ReelRoundPresentingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundPresenting):
// shows each phase's symbols, combinations, lines and win, and ends the round once the win is counted.

import { Reaction, State } from '@game/engine/Fsm/Fsm';
import {
  IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IDecreaseBetHwButton, IExitHwButton, IGambleBlackHwButton, IGambleHwButton, IGambleRedHwButton,
  IIncreaseBetHwButton, IInfoHwButton, IMaxBetHwButton, IStartHwButton, HwButtonLight,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { Currency, PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { SpinReelsPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import type { RoundPhases } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IReelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IBigWinView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { ReelRoundPresentingStatics, ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundPresentingState extends State {
  static Statics = [ReelRoundPresentingStatics];

  OnTransit() {
    this.AtachCallbacks();
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    this.Parent(IViewManager).SetupViews(roundResult, { showInitialStop: true, enableFastForwardCollect: true });
    if (roundResult.GetPhases().length) {
      Object.assign(this.statics, {
        phaseIdx: 0, HasPendingRoundEnd: false, HasAccumulatedReward: false, HasSymbolsExpanded: false,
        HasShowedFastLines: !this.Parent(IGameManager).IsAutoPlayOn(),
      });
      this.CheckGroupStackedSymbolsAnimation();
      this.ShowPhase();
    } else {
      this.TransitLater(this.ToRoundEnding());
    }
  }

  protected abstract ToRoundEnding(): Reaction;

  private get statics() {
    return this.Static(ReelRoundPresentingStatics);
  }

  private get phases(): RoundPhases {
    return this.ConstNvram(ReelRoundStorage).roundResult!.GetPhases();
  }

  private AtachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IReelsView.Events).symbolsExpanded, this.OnSymbolsExpanded);
    this.ReactOn(this.RuntimeGetConst(IBigWinView.Events).animatingDone, this.OnBigWinAnimatingDone);
    this.ReactOn(this.RuntimeGetConst(ICreditsWinBarView.Events).animatingDone, this.OnWinAccumulationFinished);
    this.ReactOn(this.RuntimeGetConst(ILinesView.Events).showFastLinesFinished, this.OnShowFastLinesFinished);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IIncreaseBetHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IDecreaseBetHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IMaxBetHwButton.Events).buttonPressedEvent, this.FastForwardRewardAccumulation);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.AutoplayFastForwardRewardAccumulation);
  }

  private ApplyCapping(phases: RoundPhases, summary: PayoutSummary) {
    const winCapping = this.RuntimeGetConst(ILimits).GetWinCapping();
    if (winCapping.capping <= 0 || !winCapping.capValueWinBar) return summary; // no capping, or no need to cap the win bar value
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    // sum rewards up to phaseIdx
    for (let i = 0; i < this.statics.phaseIdx; i++) available.AddAll(phases[i].summary.rewards);
    const capped = summary.Clone();
    // we cap the win that hits the cap for the correct behaviour for the win bars
    if (available.Get(Currency.Credits) + summary.rewards.Get(Currency.Credits) > winCapping.capping) {
      capped.rewards.Set(Currency.Credits, winCapping.capping - available.Get(Currency.Credits));
    }
    return capped;
  }

  private CheckBigWin() {
    if (this.Parent(IGameManager).IsAutoPlayOn()) return;
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    const tags = this.Parent(IReelRound).GetRoundRules().GetVisualAnalyze().GetRoundTags(roundResult);
    if (tags.length) this.RuntimeGet(IBigWinView).ShowAnimation(tags[0]);
    this.RuntimeGet(ILinesView).SetWinLineTags(tags);
  }

  private CheckGroupStackedSymbolsAnimation() {
    const phase = this.phases[this.statics.phaseIdx];
    if (!(phase instanceof SpinReelsPhase)) return;
    const va = this.Parent(IReelRound).GetRoundRules().GetVisualAnalyze();
    this.RuntimeGet(IWinFiguresView).SetStackedFigures(va.GetGroupStackedSymbols(phase.combinations));
  }

  private ShowPhase() {
    const phase = this.phases[this.statics.phaseIdx];
    if (phase instanceof SpinReelsPhase) {
      // expand symbols (then update numeric bars and show combinations)
      this.RuntimeGet(IReelsView).ShowSymbolsExpanding(phase.initialStop, phase.stop);
      this.statics.HasSymbolsExpanded = false;
      this.RefreshHWButtons(false);
    } else {
      this.NextPhase();
    }
  }

  private ShowCombinations() {
    const phases = this.phases;
    const phase = phases[this.statics.phaseIdx];
    if (!(phase instanceof SpinReelsPhase)) return;
    if (!phase.combinations.length) {
      this.statics.HasAccumulatedReward = true;
      this.statics.HasShowedFastLines = true;
      this.NextPhase();
      return;
    }
    const summary = this.ApplyCapping(phases, phase.summary);
    this.RuntimeTryGet(ICreditsWinBarView)?.AddWinResult(summary);
    this.CheckBigWin();
    // show fast combinations
    const combinations = phase.combinations;
    this.RuntimeGet(IStatusLineView).ShowCombinations(combinations, true);
    this.RuntimeGet(IInfoView).ShowCombinations(combinations);
    this.RuntimeGet(IWinFiguresView).ShowCombinations(combinations, false);
    this.RuntimeGet(ILinesView).ShowCombinations(combinations, true, this.Parent(IGameManager).IsAutoPlayOn());
    this.RuntimeGet(ILinesView).SetVisible(true);
    // hide symbols from underneath
    this.RuntimeGet(IReelsView).ShowCombinations(combinations);
    this.RefreshHWButtons(true);
    this.NextPhase();
  }

  private NextPhase() {
    if (this.statics.phaseIdx + 1 < this.phases.length) {
      this.statics.phaseIdx++;
      this.ShowPhase();
    } else {
      this.TryTransitToRoundEnding();
    }
  }

  private TryTransitToRoundEnding() {
    const statics = this.statics;
    if (statics.HasAccumulatedReward) this.RuntimeGet(IBigWinView).Clear();
    const canTransition = statics.HasAccumulatedReward && !statics.HasPendingRoundEnd && statics.HasSymbolsExpanded && statics.HasShowedFastLines;
    if (canTransition) {
      statics.HasPendingRoundEnd = true;
      this.TransitLater(this.ToRoundEnding());
    }
  }

  private FastForwardBars() {
    this.RuntimeTryGet(ICreditsWinBarView)?.FastForward();
  }

  private RefreshHWButtons(enable: boolean) {
    for (const button of [IMaxBetHwButton, IIncreaseBetHwButton, IDecreaseBetHwButton, IAutoPlayHwButton, IInfoHwButton, IStartHwButton]) {
      this.RuntimeGet(button).SetButtonState({ enabled: enable, light: HwButtonLight.On });
    }
    for (const button of [ICashoutHwButton, ICollectHwButton, IGambleHwButton, IGambleRedHwButton, IGambleBlackHwButton, IExitHwButton]) {
      this.RuntimeGet(button).SetButtonState({ enabled: false });
    }
  }

  OnSymbolsExpanded() {
    this.statics.HasSymbolsExpanded = true;
    const phase = this.phases[this.statics.phaseIdx];
    const reelsView = this.RuntimeGet(IReelsView);
    if (phase instanceof SpinReelsPhase) {
      reelsView.SetStopFigures(phase.stop);
      reelsView.ShowStopFigures();
    }
    this.ShowCombinations();
    reelsView.ClearExpandSymbols();
    return this.Consume();
  }

  OnBigWinAnimatingDone() {
    return this.Skip();
  }

  OnWinAccumulationFinished(value: number) {
    if (value === 0) return this.Skip();
    this.statics.HasAccumulatedReward = true;
    this.TryTransitToRoundEnding();
    return this.Forward();
  }

  FastForwardRewardAccumulation() {
    this.FastForwardBars();
    this.statics.HasAccumulatedReward = true;
    this.RuntimeGet(ILinesView).StopAllSounds();
    this.TryTransitToRoundEnding();
    return this.Forward();
  }

  AutoplayFastForwardRewardAccumulation() {
    /// AutoPlayHwButton disable should be handled in GameManager!!!
    if (this.Parent(IGameManager).IsAutoPlayOn()) {
      this.Parent(IGameManager).SetAutoPlay(false);
      this.RuntimeGet(ILinesView).UpdateShownCombinations(false);
    } else {
      this.FastForwardRewardAccumulation();
    }
    return this.Consume();
  }

  OnShowFastLinesFinished() {
    this.statics.HasShowedFastLines = true;
    this.statics.HasAccumulatedReward = true;
    this.FastForwardBars();
    this.TryTransitToRoundEnding();
    return this.Consume();
  }
}
