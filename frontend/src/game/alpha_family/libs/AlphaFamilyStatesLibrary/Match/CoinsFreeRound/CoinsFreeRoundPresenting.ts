// Egt::Game::AlphaFamily::CoinsFreeRoundPresentingState (AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundPresenting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ICoinsFreeRoundEnding, ICoinsFreeRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsFreeRound';
import { ReelRoundPresentingState } from '../ReelRound/ReelRoundPresenting';

export class CoinsFreeRoundPresentingState extends ReelRoundPresentingState {
  static Interfaces = [ICoinsFreeRoundPresenting, ...ReelRoundPresentingState.Interfaces];

  ToRoundEnding() {
    return this.Transit(ICoinsFreeRoundEnding);
  }
}

EgtALogCategoryClass(CoinsFreeRoundPresentingState, 'CoinsFreeRoundPresentingState');
