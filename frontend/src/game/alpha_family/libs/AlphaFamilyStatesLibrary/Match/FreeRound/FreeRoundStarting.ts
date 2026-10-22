// Egt::Game::AlphaFamily::FreeRoundStartingState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundStarting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IFreeRoundReeling, IFreeRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { ReelRoundStartingState } from '../ReelRound/ReelRoundStarting';

export class FreeRoundStartingState extends ReelRoundStartingState {
  static Interfaces = [IFreeRoundStarting, ...ReelRoundStartingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundReeling() {
    return this.Transit(IFreeRoundReeling);
  }
}

EgtALogCategoryClass(FreeRoundStartingState, 'FreeRoundStartingState');
