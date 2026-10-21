// Egt::Game::AlphaFamily::TetraRoundIntroState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundIntro): the
// "Tetra activated" splash, which switches to the tetra views midway.

import { State } from '@game/engine/Fsm/Fsm';
import { ITetraRound, ITetraRoundInput, ITetraRoundIntro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { ITetraRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';

export class TetraRoundIntroState extends State {
  static Interfaces = [ITetraRoundIntro];

  OnTransit() {
    this.ReactOn(this.RuntimeGetConst(ITetraRoundOverlayView.Events).introMidway, this.OnIntroMidway);
    this.ReactOn(this.RuntimeGetConst(ITetraRoundOverlayView.Events).introFinished, this.OnIntroFinished);
    this.RuntimeGet(ITetraRoundOverlayView).ShowIntro();
  }

  OnIntroMidway() {
    this.Parent(ITetraRound).SetupViews({ autoSelectInfoPage: true, enableInput: false });
    return this.Forward();
  }

  OnIntroFinished() {
    return this.ToRoundInput();
  }

  ToRoundInput() {
    return this.Transit(ITetraRoundInput);
  }
}
