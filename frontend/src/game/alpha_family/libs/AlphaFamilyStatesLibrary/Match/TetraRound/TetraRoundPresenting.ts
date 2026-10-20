// Egt::Game::AlphaFamily::TetraRoundPresentingState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundPresenting):
// for each sub screen in turn: stop its reels, fly its crowns into the next screens, show its lines, then dim it with
// its win.

import { State } from '../../../../../engine/Fsm/Fsm';
import { IsValidIndex } from '../../../../../engine/GameCore/Common/ContainerHelpers';
import { IStartHwButton } from '../../../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { Currency } from '../../../AlphaFamily/Math/Common/Common.data';
import { SpinReelsPhase, TetraSpinPhase } from '../../../AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { BaseReelRules } from '../../../AlphaFamily/Math/Reel/Rules/BaseReelRules';
import { IGameManager } from '../../../AlphaFamily/States/IGameManager';
import { ITetraRound, ITetraRoundEnding, ITetraRoundPresenting } from '../../../AlphaFamily/States/Match/ITetraRound';
import { ICreditsWinBarView } from '../../../AlphaFamily/Views/BarsView.bridge';
import { IInfoView } from '../../../AlphaFamily/Views/IInfoView.bridge';
import { IStatusLineView } from '../../../AlphaFamily/Views/IStatusLineView.bridge';
import { ITetraRoundView } from '../../../AlphaFamily/Views/ITetraRoundView.bridge';
import { TetraPresentingStep, TetraRoundPresentingStatics, TetraRoundStatics, TetraRoundStorage } from './TetraRound.data';

export class TetraRoundPresentingState extends State {
  static Interfaces = [ITetraRoundPresenting];

  OnTransit() {
    this.AttachCallbacks();
    this.Parent(ITetraRound).SetupViews({});
    const tetraPhase = this.GetTetraPhase();
    if (!tetraPhase || !tetraPhase.subScreens.length) {
      this.TransitLater(this.ToRoundEnding());
      return;
    }
    Object.assign(this.statics, { subScreenIdx: 0, step: TetraPresentingStep.StopReels, pendingRoundEnd: false });
    this.StartStep();
  }

  ToRoundEnding() {
    return this.Transit(ITetraRoundEnding);
  }

  private get statics() {
    return this.Static(TetraRoundPresentingStatics);
  }

  private AttachCallbacks() {
    const tetraViewEvents = this.RuntimeGetConst(ITetraRoundView.Events);
    this.ReactOn(tetraViewEvents.singleReelStopEvent, this.OnSingleReelStopped);
    this.ReactOn(tetraViewEvents.allReelsStopEvent, this.OnAllReelsStopped);
    this.ReactOn(tetraViewEvents.showCombinationsFinished, this.OnShowCombinationsFinished);
    this.ReactOn(tetraViewEvents.dimFinished, this.OnDimFinished);
    this.ReactOn(tetraViewEvents.flyAnimationEndEvent, this.OnFlyingSymbolAnimationEnd);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
  }

  private StartStep() {
    switch (this.statics.step) {
      case TetraPresentingStep.StopReels: this.StartStopReels(); break;
      case TetraPresentingStep.FlyCrowns: this.StartFlyCrowns(); break;
      case TetraPresentingStep.ShowLines: this.StartShowLines(); break;
      case TetraPresentingStep.DimAndAnnounce: this.StartDimAndAnnounce(); break;
      case TetraPresentingStep.SpecialCombo: this.StartSpecialCombo(); break;
    }
  }

  private Advance() {
    const statics = this.statics;
    if (statics.pendingRoundEnd) return;
    if (statics.step === TetraPresentingStep.SpecialCombo) {
      statics.pendingRoundEnd = true;
      this.TransitLater(this.ToRoundEnding());
      return;
    }
    if (statics.step === TetraPresentingStep.DimAndAnnounce) {
      if (statics.subScreenIdx + 1 < this.GetSubScreenCount()) {
        ++statics.subScreenIdx;
        statics.step = TetraPresentingStep.StopReels;
      } else {
        statics.step = TetraPresentingStep.SpecialCombo;
      }
    } else {
      statics.step = statics.step + 1;
    }
    this.StartStep();
  }

  private StartStopReels() {
    const subScreenIdx = this.statics.subScreenIdx;
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (!spin) return this.Advance();
    const tetraView = this.RuntimeGet(ITetraRoundView);
    tetraView.SetStopFigures(subScreenIdx, spin.stop);
    tetraView.SetSymbolsAroundStop(subScreenIdx, spin.beforeStop, spin.afterStop);
    if (this.ConstStatic(TetraRoundStatics).requestedFastStop) {
      tetraView.StartFastReelingStop(subScreenIdx);
      return;
    }
    tetraView.StartNormalReelingStop(subScreenIdx, 0);
  }

  private StartFlyCrowns() {
    const subScreenIdx = this.statics.subScreenIdx;
    const lastScreen = subScreenIdx + 1 >= this.GetSubScreenCount();
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (lastScreen || !this.HasCrowns(subScreenIdx) || !spin) return this.Advance();
    const tetraView = this.RuntimeGet(ITetraRoundView);
    tetraView.SetTetraFlyingSymbols(subScreenIdx, spin.stop);
    tetraView.StartFlyingAnimation(subScreenIdx);
  }

  private StartShowLines() {
    const subScreenIdx = this.statics.subScreenIdx;
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (!spin) return this.Advance();
    const tetraPhase = this.GetTetraPhase();
    if (tetraPhase && IsValidIndex(tetraPhase.subScreens, subScreenIdx)) {
      const summary = tetraPhase.subScreens[subScreenIdx].summary;
      if (summary.rewards.Get(Currency.Credits) > 0) this.RuntimeTryGet(ICreditsWinBarView)?.AddWinResult(summary);
    }
    if (!spin.combinations.length) return this.Advance();
    const autoPlay = this.Parent(IGameManager).IsAutoPlayOn();
    this.RuntimeGet(ITetraRoundView).ShowCombinations(subScreenIdx, spin.combinations, autoPlay, autoPlay);
    this.RuntimeGet(IStatusLineView).ShowCombinations(spin.combinations, true);
    this.RuntimeTryGet(IInfoView)?.ShowCombinations(spin.combinations);
  }

  private StartFastShowLines() {
    this.RuntimeGet(ITetraRoundView).StartFastCombinationsStop(this.statics.subScreenIdx);
    this.Advance();
  }

  private StartDimAndAnnounce() {
    const subScreenIdx = this.statics.subScreenIdx;
    const tetraPhase = this.GetTetraPhase();
    if (!tetraPhase || !IsValidIndex(tetraPhase.subScreens, subScreenIdx)) return;
    const subScreen = tetraPhase.subScreens[subScreenIdx];
    const tetraView = this.RuntimeGet(ITetraRoundView);
    tetraView.ClearCombinations(subScreenIdx);
    tetraView.SetWinValue(subScreenIdx, subScreen.summary.rewards.Get(Currency.Credits));
    tetraView.SetDimmed(subScreenIdx, true);
  }

  private StartSpecialCombo() {
    this.Advance();
  }

  private GetTetraPhase() {
    const roundResult = this.ConstNvram(TetraRoundStorage).roundResult;
    if (!roundResult) return null;
    const phases = roundResult.GetPhases();
    if (!phases.length) return null;
    const phase = phases[0];
    return phase instanceof TetraSpinPhase ? phase : null;
  }

  private GetSubScreenSpin(subScreenIdx: number) {
    const tetraPhase = this.GetTetraPhase();
    if (!tetraPhase || !IsValidIndex(tetraPhase.subScreens, subScreenIdx)) return null;
    const subScreen = tetraPhase.subScreens[subScreenIdx];
    if (!subScreen.phases.length) return null;
    const phase = subScreen.phases[0];
    return phase instanceof SpinReelsPhase ? phase : null;
  }

  private GetSubScreenCount() {
    const tetraPhase = this.GetTetraPhase();
    if (!tetraPhase) return 0;
    return tetraPhase.subScreens.length;
  }

  private HasCrowns(subScreenIdx: number) {
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (!spin) return false;
    const tetraRules = this.ConstParent(ITetraRound).GetRoundRules().GetTetraSpinRules();
    if (!tetraRules.GetConfig().subScreens[subScreenIdx]) return false;
    const subConfig = tetraRules.GetSubScreenRules(subScreenIdx).GetConfig();
    const crownIds = [...subConfig.copySymbolsConfig.symbolIds];
    if (subConfig.stickSymbolsConfig.symbolId !== -1) crownIds.push(subConfig.stickSymbolsConfig.symbolId);
    return crownIds.length > 0 && BaseReelRules.GetAllCoordinates(spin.stop, crownIds).length > 0;
  }

  private StopNextReel(subScreenIdx: number, stoppedReelIds: number[]) {
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (!spin) return;
    const next = spin.stop.findIndex((_, i) => !stoppedReelIds.includes(i));
    if (next >= 0) this.RuntimeGet(ITetraRoundView).StartNormalReelingStop(subScreenIdx, next);
  }

  OnSingleReelStopped(subScreen: number, _reelId: number, stoppedReelIds: number[]) {
    const statics = this.statics;
    if (statics.step !== TetraPresentingStep.StopReels || subScreen !== statics.subScreenIdx) return this.Skip();
    if (this.ConstStatic(TetraRoundStatics).requestedFastStop) return this.Skip();
    this.StopNextReel(subScreen, stoppedReelIds);
    return this.Consume();
  }

  OnAllReelsStopped() {
    if (this.statics.step !== TetraPresentingStep.StopReels) return this.Skip();
    this.Advance();
    return this.Consume();
  }

  OnStartHwButtonPressed() {
    switch (this.statics.step) {
      case TetraPresentingStep.StopReels:
        this.Static(TetraRoundStatics).requestedFastStop = true;
        this.RuntimeGet(ITetraRoundView).StartFastReelingStop(this.statics.subScreenIdx);
        return this.Consume();
      case TetraPresentingStep.ShowLines:
        this.StartFastShowLines();
        return this.Consume();
      default:
        return this.Skip();
    }
  }

  OnShowCombinationsFinished(subScreen: number) {
    if (this.statics.step !== TetraPresentingStep.ShowLines || subScreen !== this.statics.subScreenIdx) return this.Skip();
    this.Advance();
    return this.Consume();
  }

  OnDimFinished() {
    if (this.statics.step !== TetraPresentingStep.DimAndAnnounce) return this.Skip();
    this.Advance();
    return this.Consume();
  }

  OnFlyingSymbolAnimationEnd() {
    if (this.statics.step !== TetraPresentingStep.FlyCrowns) return this.Skip();
    this.Advance();
    return this.Consume();
  }
}
