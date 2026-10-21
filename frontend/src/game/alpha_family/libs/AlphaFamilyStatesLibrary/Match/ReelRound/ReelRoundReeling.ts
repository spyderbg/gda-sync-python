// Egt::Game::AlphaFamily::ReelRoundReelingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundReeling): stops
// the reels one after another (or all at once on START) at the round's stop.

import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import { Contains } from '@game/engine/GameCore/Common/ContainerHelpers';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import type { ConstPointer, int } from '@game/engine/GameCore/Common/Types';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { EStatusLine } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { SpinReelsPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IReelRound, IReelRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStopSingleReelSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ReelRoundStatics, ReelRoundStorage } from './ReelRound.data';

function GetSpinReelPhase(nvram: ReelRoundStorage, runtime: Runtime): ConstPointer<SpinReelsPhase> {
  const roundResult = nvram.roundResult;
  assert(roundResult);
  const phases = roundResult.GetPhases(runtime);
  assert(phases.length !== 0);
  return phases[0] instanceof SpinReelsPhase ? phases[0] : null;
}

export abstract class ReelRoundReelingState extends State {
  static Interfaces = [IReelRoundReeling];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AtachCallbacks();

    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult;
    assert(roundResult);

    this.Parent(IViewManager).SetupViews(roundResult, {
      statusLine: EStatusLine.GoodLuck,
      startReeling: true,
      stopFirstReel: true,
      showInitialStop: true,
      disableInfoButton: true,
    });

    this.CheckFastStop();
  }

  abstract ToRoundPresenting(): Reaction;

  OnSingleReelStopped(_reelId: int, stoppedReelIds: int[]) {
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(_reelId, false);

    const reelsView = this.RuntimeGet(IReelsView);
    const phase = GetSpinReelPhase(this.ConstNvram(ReelRoundStorage), this.GetRuntime())!;

    const roundRules = this.Parent(IReelRound).GetRoundRules();
    const va = roundRules.GetVisualAnalyze();

    for (let i: int = 0; i < phase.stop.length; i++) {
      const tags = va.GetReelTags(phase, i, stoppedReelIds);

      reelsView.SetReelTags(i, tags);
    }

    if (!this.ConstStatic(ReelRoundStatics).requestedFastStop) {
      for (let i: int = 0; i < phase.stop.length; i++) {
        if (!Contains(stoppedReelIds, i)) {
          reelsView.StartNormalReelingStop(i);
          break;
        }
      }
    }

    return this.Forward();
  }

  OnAllReelsStopped() {
    return this.ToRoundPresenting();
  }

  OnStopSingleReelSwButtonPressed(id: int) {
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

    const isAutoPlayOn: boolean = this.Parent(IGameManager).IsAutoPlayOn();

    if (isAutoPlayOn) {
      this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: false });
    } else {
      this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: true });
    }

    this.RuntimeGet(IReelsView).StartFastReelingStop();
  }
}

EgtALogCategoryClass(ReelRoundReelingState, 'ReelRoundReelingState');
