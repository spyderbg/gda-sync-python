// Egt::Game::AlphaFamily::MainRoundStartingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundStarting).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IMainRoundReeling, IMainRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { ReelRoundStartingState } from '../ReelRound/ReelRoundStarting';

export class MainRoundStartingState extends ReelRoundStartingState {
  static Interfaces = [IMainRoundStarting, ...ReelRoundStartingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundReeling() {
    return this.Transit(IMainRoundReeling);
  }
}

EgtALogCategoryClass(MainRoundStartingState, 'MainRoundStartingState');
