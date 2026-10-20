// Egt::Game::AlphaFamily::MainRoundEndingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundEnding).

import { IMatch } from '../../../AlphaFamily/States/Match/IMatch';
import { IMainRoundEnding } from '../../../AlphaFamily/States/Match/IMainRound';
import { ReelRoundEndingState } from '../ReelRound/ReelRoundEnding';

export class MainRoundEndingState extends ReelRoundEndingState {
  static Interfaces = [IMainRoundEnding];

  protected ToRoundOutro() {
    // Main round has no Outro => jump to next round
    return this.Parent(IMatch).ToNextRound();
  }
}
