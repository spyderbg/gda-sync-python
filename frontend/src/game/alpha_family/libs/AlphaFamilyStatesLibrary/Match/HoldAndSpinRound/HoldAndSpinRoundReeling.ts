// Egt::Game::AlphaFamily::HoldAndSpinRoundReelingState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundReeling):
// spins the free positions of the reels to the phase's stop.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IHoldAndSpinRound, IHoldAndSpinRoundPresenting, IHoldAndSpinRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';

export class HoldAndSpinRoundReelingState extends State {
  static Interfaces = [IHoldAndSpinRoundReeling];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AtachCallbacks();

    this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true, setupReels: false, setupHoldAndSpinReels: true, showMainInfo: true });
  }

  ToRoundPresenting() {
    return this.Transit(IHoldAndSpinRoundPresenting);
  }

  OnHoldAndSpinFinished() {
    return this.ToRoundPresenting();
  }

  private AtachCallbacks() {
    const ev = this.RuntimeGetConst(IReelsView.Events);
    this.ReactOn(ev.holdAndSpinFinished, this.OnHoldAndSpinFinished);
  }
}

EgtALogCategoryClass(HoldAndSpinRoundReelingState, 'HoldAndSpinRoundReelingState');
