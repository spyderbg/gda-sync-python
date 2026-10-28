// Egt::Game::AlphaFamily::WheelRoundInputState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundInput): waits for
// the wheel's start (or START, COLLECT), or its cancel unless the wheel is forced; a pending cashout starts it.

import { State } from '@game/engine/Fsm/Fsm';
import { ICollectHwButton, IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ISystemManager } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IWheelRound, IWheelRoundInput, IWheelRoundOutro, IWheelRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { IWheelCancelSwButtonView, IWheelStartSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class WheelRoundInputState extends State {
  static Interfaces = [IWheelRoundInput];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.RefreshViews(_isRecovery);

    if (this.Parent(ISystemManager).HasPendingCashout()) {
      this.TransitLater(IWheelRoundStarting);
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWheelCancelSwButtonView.Events).buttonPressedEvent, this.OnWheelCancelSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IWheelStartSwButtonView.Events).buttonPressedEvent, this.ToRoundStarting);
    // hw buttons
    this.ReactOn(this.RuntimeGetConst(ICollectHwButton.Events).buttonPressedEvent, this.ToRoundStarting);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.ToRoundStarting);
  }

  private RefreshViews(isRecovery: boolean) {
    const hasPendingCashout = this.Parent(ISystemManager).HasPendingCashout();
    const enableCancelButton = !this.RuntimeGetConst(IGameflow).IsForcedWheel() && !hasPendingCashout;

    this.Parent(IWheelRound).SetupViews({ enableButtons: true, enableCancelButton: enableCancelButton, autoSelectInfoPage: isRecovery });
  }

  private ToRoundStarting() {
    return this.Transit(IWheelRoundStarting);
  }

  private OnWheelCancelSwButtonPressed() {
    return this.Transit(IWheelRoundOutro);
  }
}

EgtALogCategoryClass(WheelRoundInputState, 'WheelRoundInputState');
