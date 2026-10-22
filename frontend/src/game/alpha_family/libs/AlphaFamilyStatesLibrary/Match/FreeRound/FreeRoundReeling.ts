// Egt::Game::AlphaFamily::FreeRoundReelingState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundReeling).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IFreeRoundPresenting, IFreeRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { ReelRoundReelingState } from '../ReelRound/ReelRoundReeling';

export class FreeRoundReelingState extends ReelRoundReelingState {
  static Interfaces = [IFreeRoundReeling, ...ReelRoundReelingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundPresenting() {
    return this.Transit(IFreeRoundPresenting);
  }
}

EgtALogCategoryClass(FreeRoundReelingState, 'FreeRoundReelingState');
