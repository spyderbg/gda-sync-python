// Egt::Game::AlphaFamily::MainRoundReelingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundReeling).

import { IMainRoundPresenting, IMainRoundReeling } from '../../../AlphaFamily/States/Match/IMainRound';
import { ReelRoundReelingState } from '../ReelRound/ReelRoundReeling';

export class MainRoundReelingState extends ReelRoundReelingState {
  static Interfaces = [IMainRoundReeling];

  protected ToRoundPresenting() {
    return this.Transit(IMainRoundPresenting);
  }
}
