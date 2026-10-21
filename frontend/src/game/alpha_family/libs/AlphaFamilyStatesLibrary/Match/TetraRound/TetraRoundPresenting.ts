// Egt::Game::AlphaFamily::TetraRoundPresentingState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundPresenting):
// for each sub screen in turn: stop its reels, fly its crowns into the next screens, show its lines, then dim it with
// its win.

import { State } from '@game/engine/Fsm/Fsm';
import { Contains, IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { type ConstPointer, type int, static_cast } from '@game/engine/GameCore/Common/Types';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, type SymbolIds } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { SpinReelsPhase, TetraSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { BaseReelRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/BaseReelRules';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ITetraRound, ITetraRoundEnding, ITetraRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { ITetraRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import { TetraPresentingStep, TetraRoundPresentingStatics, TetraRoundStatics, TetraRoundStorage } from './TetraRound.data';

export class TetraRoundPresentingState extends State {
  static Interfaces = [ITetraRoundPresenting];
  static Statics = [TetraRoundPresentingStatics];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(ITetraRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(ITetraRound).SetupViews({});

    const tetraPhase = this.GetTetraPhase();
    if (tetraPhase === null || tetraPhase.subScreens.length === 0) {
      this.TransitLater(this.ToRoundEnding());
      return;
    }

    const statics = this.Static(TetraRoundPresentingStatics);
    statics.subScreenIdx = 0;
    statics.step = TetraPresentingStep.StopReels;
    statics.pendingRoundEnd = false;

    this.StartStep();
  }

  ToRoundEnding() {
    return this.Transit(ITetraRoundEnding);
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
    const statics = this.ConstStatic(TetraRoundPresentingStatics);
    EgtATrace('StartStep screen={} step={}', statics.subScreenIdx, static_cast<int>(statics.step));

    switch (statics.step) {
      case TetraPresentingStep.StopReels: this.StartStopReels(); break;
      case TetraPresentingStep.FlyCrowns: this.StartFlyCrowns(); break;
      case TetraPresentingStep.ShowLines: this.StartShowLines(); break;
      case TetraPresentingStep.DimAndAnnounce: this.StartDimAndAnnounce(); break;
      case TetraPresentingStep.SpecialCombo: this.StartSpecialCombo(); break;
    }
  }

  private Advance() {
    const statics = this.Static(TetraRoundPresentingStatics);
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
    const subScreenIdx = this.ConstStatic(TetraRoundPresentingStatics).subScreenIdx;
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (spin === null) {
      this.Advance();
      return;
    }

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
    const subScreenIdx = this.ConstStatic(TetraRoundPresentingStatics).subScreenIdx;
    const lastScreen: boolean = subScreenIdx + 1 >= this.GetSubScreenCount();
    if (lastScreen || !this.HasCrowns(subScreenIdx)) {
      this.Advance();
      return;
    }

    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (spin === null) return this.Advance();

    const tetraView = this.RuntimeGet(ITetraRoundView);
    tetraView.SetTetraFlyingSymbols(subScreenIdx, spin.stop);

    tetraView.StartFlyingAnimation(subScreenIdx);
  }

  private StartShowLines() {
    const subScreenIdx = this.ConstStatic(TetraRoundPresentingStatics).subScreenIdx;
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (spin === null) {
      this.Advance();
      return;
    }

    const tetraPhase = this.GetTetraPhase();
    if (tetraPhase !== null && IsValidIndex(tetraPhase.subScreens, subScreenIdx)) {
      const summary = tetraPhase.subScreens[subScreenIdx].summary;
      if (summary.rewards.Get(Currency.Credits) > 0) {
        const winBar = this.RuntimeTryGet(ICreditsWinBarView);
        if (winBar) {
          winBar.AddWinResult(summary);
        }
      }
    }

    if (spin.combinations.length === 0) {
      this.Advance();
      return;
    }

    const fastLines = this.ConstStatic(TetraRoundStatics).showFastLines;
    const autoPlay = this.Parent(IGameManager).IsAutoPlayOn();
    this.RuntimeGet(ITetraRoundView).ShowCombinations(subScreenIdx, spin.combinations, fastLines, autoPlay);

    this.RuntimeGet(IStatusLineView).ShowCombinations(spin.combinations, fastLines);

    const infoView = this.RuntimeTryGet(IInfoView);
    if (infoView) {
      infoView.ShowCombinations(spin.combinations);
    }
  }

  private StartFastShowLines() {
    const subScreenIdx = this.ConstStatic(TetraRoundPresentingStatics).subScreenIdx;
    this.RuntimeGet(ITetraRoundView).StartFastCombinationsStop(subScreenIdx);

    this.Advance();
  }

  private StartDimAndAnnounce() {
    const subScreenIdx = this.ConstStatic(TetraRoundPresentingStatics).subScreenIdx;
    const tetraPhase = this.GetTetraPhase();
    if (AssertIf(tetraPhase === null)) return;
    if (AssertIf(!IsValidIndex(tetraPhase!.subScreens, subScreenIdx))) return;

    this.RuntimeGet(ITetraRoundView).ClearCombinations(subScreenIdx);

    const summary = tetraPhase!.subScreens[subScreenIdx].summary;
    const tetraView = this.RuntimeGet(ITetraRoundView);
    tetraView.SetWinValue(subScreenIdx, summary.rewards.Get(Currency.Credits));
    tetraView.SetDimmed(subScreenIdx, true);
  }

  private StartSpecialCombo() {
    EgtATrace('StartSpecialCombo skip (TetraSpinRules::Update TBD)');
    this.Advance();
  }

  private GetTetraPhase(): ConstPointer<TetraSpinPhase> {
    const roundResult = this.ConstNvram(TetraRoundStorage).roundResult;
    if (roundResult === null) return null;

    const phases = roundResult.GetPhases();
    if (phases.length === 0) return null;

    return phases[0] instanceof TetraSpinPhase ? phases[0] : null;
  }

  private GetSubScreenSpin(subScreenIdx: int): ConstPointer<SpinReelsPhase> {
    const tetraPhase = this.GetTetraPhase();
    if (tetraPhase === null) return null;
    if (!IsValidIndex(tetraPhase.subScreens, subScreenIdx)) return null;

    const subScreen = tetraPhase.subScreens[subScreenIdx];
    if (subScreen.phases.length === 0) return null;

    return subScreen.phases[0] instanceof SpinReelsPhase ? subScreen.phases[0] : null;
  }

  private GetSubScreenCount() {
    const tetraPhase = this.GetTetraPhase();
    if (tetraPhase === null) return 0;
    return tetraPhase.subScreens.length;
  }

  private HasCrowns(subScreenIdx: int) {
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (spin === null) return false;

    const tetraRules = this.ConstParent(ITetraRound).GetRoundRules().GetTetraSpinRules();
    if (!IsValidIndex(tetraRules.GetConfig().subScreens, subScreenIdx)) return false;

    const subConfig = tetraRules.GetSubScreenRules(subScreenIdx).GetConfig();
    const crownIds: SymbolIds = [...subConfig.copySymbolsConfig.symbolIds];
    if (subConfig.stickSymbolsConfig.symbolId !== -1) {
      crownIds.push(subConfig.stickSymbolsConfig.symbolId);
    }

    if (crownIds.length === 0) return false;
    return BaseReelRules.GetAllCoordinates(spin.stop, crownIds).length !== 0;
  }

  private StopNextReel(subScreenIdx: int, stoppedReelIds: int[]) {
    const spin = this.GetSubScreenSpin(subScreenIdx);
    if (spin === null) return;

    const tetraView = this.RuntimeGet(ITetraRoundView);
    for (let i: int = 0; i < spin.stop.length; ++i) {
      if (!Contains(stoppedReelIds, i)) {
        tetraView.StartNormalReelingStop(subScreenIdx, i);
        break;
      }
    }
  }

  private OnSingleReelStopped(subScreen: int, _reelId: int, stoppedReelIds: int[]) {
    const statics = this.ConstStatic(TetraRoundPresentingStatics);
    if (statics.step !== TetraPresentingStep.StopReels) return this.Skip();
    if (subScreen !== statics.subScreenIdx) return this.Skip();
    if (this.ConstStatic(TetraRoundStatics).requestedFastStop) return this.Skip();

    this.StopNextReel(subScreen, stoppedReelIds);
    return this.Consume();
  }

  private OnAllReelsStopped() {
    const statics = this.ConstStatic(TetraRoundPresentingStatics);
    if (statics.step !== TetraPresentingStep.StopReels) return this.Skip();

    this.Advance();
    return this.Consume();
  }

  private OnStartHwButtonPressed() {
    const statics = this.ConstStatic(TetraRoundPresentingStatics);

    switch (statics.step) {
      case TetraPresentingStep.StopReels:
        this.Static(TetraRoundStatics).requestedFastStop = true;
        this.RuntimeGet(ITetraRoundView).StartFastReelingStop(statics.subScreenIdx);
        return this.Consume();

      case TetraPresentingStep.ShowLines: this.StartFastShowLines(); return this.Consume();

      case TetraPresentingStep.FlyCrowns: // [[fallthrough]]
      case TetraPresentingStep.DimAndAnnounce: // [[fallthrough]]
      case TetraPresentingStep.SpecialCombo: // [[fallthrough]]
      default: return this.Skip();
    }
  }

  private OnShowCombinationsFinished(subScreen: int) {
    const statics = this.ConstStatic(TetraRoundPresentingStatics);
    if (statics.step !== TetraPresentingStep.ShowLines) return this.Skip();
    if (subScreen !== statics.subScreenIdx) return this.Skip();

    this.Advance();
    return this.Consume();
  }

  private OnDimFinished() {
    const statics = this.ConstStatic(TetraRoundPresentingStatics);
    if (statics.step !== TetraPresentingStep.DimAndAnnounce) return this.Skip();

    this.Advance();
    return this.Consume();
  }

  private OnFlyingSymbolAnimationEnd() {
    const statics = this.ConstStatic(TetraRoundPresentingStatics);
    if (statics.step !== TetraPresentingStep.FlyCrowns) return this.Skip();

    this.Advance();
    return this.Consume();
  }
}

EgtALogCategoryClass(TetraRoundPresentingState, 'TetraRoundPresentingState');
