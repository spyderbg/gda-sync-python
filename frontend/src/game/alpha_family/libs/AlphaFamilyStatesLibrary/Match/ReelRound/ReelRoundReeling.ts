// Egt::Game::AlphaFamily::ReelRoundReelingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundReeling): stops
// the reels one after another (or all at once on START) at the round's stop.

import { Reaction, State } from '../../../../../engine/Fsm/Fsm';
import { IStartHwButton } from '../../../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { EStatusLine } from '../../../AlphaFamily/Math/Common/Common.data';
import { SpinReelsPhase } from '../../../AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IGameManager } from '../../../AlphaFamily/States/IGameManager';
import { IViewManager } from '../../../AlphaFamily/States/IViewManager';
import { IReelRound } from '../../../AlphaFamily/States/Match/IReelRound';
import { IReelsView } from '../../../AlphaFamily/Views/IReelsView.bridge';
import { IStopSingleReelSwButtonView } from '../../../AlphaFamily/Views/SwButtonViews.bridge';
import { ReelRoundStatics, ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundReelingState extends State {
  OnTransit() {
    this.AtachCallbacks();
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    this.Parent(IViewManager).SetupViews(roundResult, {
      statusLine: EStatusLine.GoodLuck, startReeling: true, stopFirstReel: true, showInitialStop: true, disableInfoButton: true,
    });
    this.CheckFastStop();
  }

  protected abstract ToRoundPresenting(): Reaction;

  private GetSpinReelPhase() {
    const phase = this.ConstNvram(ReelRoundStorage).roundResult!.GetPhases()[0];
    return phase instanceof SpinReelsPhase ? phase : null;
  }

  OnSingleReelStopped(reelId: number, stoppedReelIds: number[]) {
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(reelId, false);
    const reelsView = this.RuntimeGet(IReelsView);
    const phase = this.GetSpinReelPhase();
    if (!phase) return this.Forward();
    const va = this.Parent(IReelRound).GetRoundRules().GetVisualAnalyze();
    for (let i = 0; i < phase.stop.length; i++) reelsView.SetReelTags(i, va.GetReelTags(phase, i, stoppedReelIds));
    if (!this.ConstStatic(ReelRoundStatics).requestedFastStop) {
      const next = phase.stop.findIndex((_, i) => !stoppedReelIds.includes(i));
      if (next >= 0) reelsView.StartNormalReelingStop(next);
    }
    return this.Forward();
  }

  OnAllReelsStopped() {
    return this.ToRoundPresenting();
  }

  OnStopSingleReelSwButtonPressed(id: number) {
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(id, false);
    this.RuntimeGet(IReelsView).StartFastReelStop(id);
    return this.Forward();
  }

  OnStartHwButtonPressed() {
    if (this.ConstStatic(ReelRoundStatics).requestedFastStop) return this.Forward();
    this.Static(ReelRoundStatics).requestedFastStop = true;
    this.CheckFastStop();
    return this.Forward();
  }

  private AtachCallbacks() {
    const reelsViewEvents = this.RuntimeGetConst(IReelsView.Events);
    this.ReactOn(reelsViewEvents.singleReelStopEvent, this.OnSingleReelStopped);
    this.ReactOn(reelsViewEvents.allReelsStopEvent, this.OnAllReelsStopped);
    this.ReactOn(this.RuntimeGetConst(IStopSingleReelSwButtonView.Events).buttonPressedEvent, this.OnStopSingleReelSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
  }

  private CheckFastStop() {
    if (!this.ConstStatic(ReelRoundStatics).requestedFastStop) return;
    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: !this.Parent(IGameManager).IsAutoPlayOn() });
    this.RuntimeGet(IReelsView).StartFastReelingStop();
  }
}
