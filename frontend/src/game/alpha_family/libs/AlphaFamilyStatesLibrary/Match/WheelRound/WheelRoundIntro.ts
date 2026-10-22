// Egt::Game::AlphaFamily::WheelRoundIntroState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundIntro): the
// wheel's intro, which shows the wheel midway.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IWheelRound, IWheelRoundInput, IWheelRoundIntro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { IWheelRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundOverlayView.bridge';

export class WheelRoundIntroState extends State {
  static Interfaces = [IWheelRoundIntro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.ReactOn(this.RuntimeGetConst(IWheelRoundOverlayView.Events).introMidway, this.OnIntroMidway);
    this.ReactOn(this.RuntimeGetConst(IWheelRoundOverlayView.Events).introFinished, this.OnIntroFinished);

    this.Parent(IViewManager).SetupViews(RoundType.Coins, { overrideSpecialRoundView: RoundType.Wheel });
    this.RuntimeGet(IWheelRoundOverlayView).StartIntro();
  }

  ToRoundInput() {
    return this.Transit(IWheelRoundInput);
  }

  private OnIntroMidway() {
    this.Parent(IWheelRound).SetupViews({ autoSelectInfoPage: true });

    return this.Forward();
  }

  private OnIntroFinished() {
    return this.ToRoundInput();
  }
}

EgtALogCategoryClass(WheelRoundIntroState, 'WheelRoundIntroState');
