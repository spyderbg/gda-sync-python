// Egt::Game::AlphaFamily::MainRoundPresentingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundPresenting).

import { IMainRoundEnding, IMainRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { ReelRoundPresentingState } from '../ReelRound/ReelRoundPresenting';

export class MainRoundPresentingState extends ReelRoundPresentingState {
  static Interfaces = [IMainRoundPresenting];

  protected ToRoundEnding() {
    return this.Transit(IMainRoundEnding);
  }
}
