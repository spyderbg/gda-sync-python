// Egt::Game::AlphaFamily::MainRoundPresentingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundPresenting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IMainRoundEnding, IMainRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { ReelRoundPresentingState } from '../ReelRound/ReelRoundPresenting';

export class MainRoundPresentingState extends ReelRoundPresentingState {
  static Interfaces = [IMainRoundPresenting, ...ReelRoundPresentingState.Interfaces];

  ToRoundEnding() {
    return this.Transit(IMainRoundEnding);
  }
}

EgtALogCategoryClass(MainRoundPresentingState, 'MainRoundPresentingState');
