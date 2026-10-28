// Egt::Game::AlphaFamily::CoinsRoundStartingState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundStarting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ICoinsRoundReeling, ICoinsRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { ReelRoundStartingState } from '../ReelRound/ReelRoundStarting';

export class CoinsRoundStartingState extends ReelRoundStartingState {
  static Interfaces = [ICoinsRoundStarting, ...ReelRoundStartingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundReeling() {
    return this.Transit(ICoinsRoundReeling);
  }
}

EgtALogCategoryClass(CoinsRoundStartingState, 'CoinsRoundStartingState');
