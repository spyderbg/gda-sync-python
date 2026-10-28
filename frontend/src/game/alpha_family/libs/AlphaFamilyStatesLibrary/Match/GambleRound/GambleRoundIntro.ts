// Egt::Game::AlphaFamily::GambleRoundIntroState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundIntro): the
// gamble's intro, which shows the gamble midway.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGambleRound, IGambleRoundInput, IGambleRoundIntro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IGambleRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundOverlayView.bridge';

export class GambleRoundIntroState extends State {
  static Interfaces = [IGambleRoundIntro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.ReactOn(this.RuntimeGetConst(IGambleRoundOverlayView.Events).introMidway, this.OnIntroMidway);
    this.ReactOn(this.RuntimeGetConst(IGambleRoundOverlayView.Events).introFinished, this.OnIntroFinished);

    this.RuntimeGet(IGambleRoundOverlayView).StartIntro();
  }

  ToRoundInput() {
    return this.Transit(IGambleRoundInput);
  }

  private OnIntroMidway() {
    this.Parent(IGambleRound).SetupViews({ enableInput: false, autoSelectInfoPage: true });

    return this.Forward();
  }

  private OnIntroFinished() {
    return this.ToRoundInput();
  }
}

EgtALogCategoryClass(GambleRoundIntroState, 'GambleRoundIntroState');
