// Egt::Game::AlphaFamily::CoinsRoundReelingState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundReeling).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ICoinsRoundPresenting, ICoinsRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { ReelRoundReelingState } from '../ReelRound/ReelRoundReeling';

export class CoinsRoundReelingState extends ReelRoundReelingState {
  static Interfaces = [ICoinsRoundReeling, ...ReelRoundReelingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundPresenting() {
    return this.Transit(ICoinsRoundPresenting);
  }
}

EgtALogCategoryClass(CoinsRoundReelingState, 'CoinsRoundReelingState');
