// Egt::Game::AlphaFamily::MainRoundStartingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundStarting).

import { IMainRoundReeling, IMainRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { ReelRoundStartingState } from '../ReelRound/ReelRoundStarting';

export class MainRoundStartingState extends ReelRoundStartingState {
  static Interfaces = [IMainRoundStarting];

  protected ToRoundReeling() {
    return this.Transit(IMainRoundReeling);
  }
}
