// Egt::Game::AlphaFamily::HoldAndSpinRoundIntroState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundIntro):
// the hold and spin intro on the reels, then on the info screen at START; none between the round's spins.

import { State } from '@game/engine/Fsm/Fsm';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IHoldAndSpinRound, IHoldAndSpinRoundIntro, IHoldAndSpinRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IHoldAndSpinRoundInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { IHoldAndSpinRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';

export class HoldAndSpinRoundIntroState extends State {
  static Interfaces = [IHoldAndSpinRoundIntro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    if (this.HasIntro()) {
      this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true });
      this.RuntimeGet(IHoldAndSpinRoundOverlayView).ShowIntro();
    } else {
      this.TransitLater(this.ToRoundInput());
    }
  }

  ToRoundInput() {
    // no input for now - maybe a start button press later
    return this.Transit(IHoldAndSpinRoundStarting);
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);

    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundOverlayView.Events).introMidway, this.OnIntroMidway);
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundOverlayView.Events).introFinished, this.OnIntroFinished);
  }

  private HasIntro() {
    const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();
    return lastResult.GetRoundType() !== this.ConstParent(IHoldAndSpinRound).GetRoundType();
  }

  private OnIntroMidway() {
    return this.Skip();
  }

  private OnStartHwButtonPressed() {
    this.RuntimeGet(IHoldAndSpinRoundOverlayView).HideIntro();
    this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowIntro();

    return this.Consume();
  }

  private OnIntroFinished() {
    return this.ToRoundInput();
  }
}

EgtALogCategoryClass(HoldAndSpinRoundIntroState, 'HoldAndSpinRoundIntroState');
