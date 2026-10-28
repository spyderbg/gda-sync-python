// Egt::Game::AlphaFamily::FreeRoundPresentingState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundPresenting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IFreeRoundEnding, IFreeRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { ReelRoundPresentingState } from '../ReelRound/ReelRoundPresenting';

export class FreeRoundPresentingState extends ReelRoundPresentingState {
  static Interfaces = [IFreeRoundPresenting, ...ReelRoundPresentingState.Interfaces];

  ToRoundEnding() {
    return this.Transit(IFreeRoundEnding);
  }
}

EgtALogCategoryClass(FreeRoundPresentingState, 'FreeRoundPresentingState');
