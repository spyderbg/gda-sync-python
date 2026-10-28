// Egt::Game::AlphaFamily::CoinsFreeRoundStartingState (AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundStarting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ICoinsFreeRoundReeling, ICoinsFreeRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsFreeRound';
import { ReelRoundStartingState } from '../ReelRound/ReelRoundStarting';

export class CoinsFreeRoundStartingState extends ReelRoundStartingState {
  static Interfaces = [ICoinsFreeRoundStarting, ...ReelRoundStartingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundReeling() {
    return this.Transit(ICoinsFreeRoundReeling);
  }
}

EgtALogCategoryClass(CoinsFreeRoundStartingState, 'CoinsFreeRoundStartingState');
