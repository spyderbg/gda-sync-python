// Egt::Game::AlphaFamily::CoinsFreeRoundReelingState (AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRoundReeling).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ICoinsFreeRoundPresenting, ICoinsFreeRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsFreeRound';
import { ReelRoundReelingState } from '../ReelRound/ReelRoundReeling';

export class CoinsFreeRoundReelingState extends ReelRoundReelingState {
  static Interfaces = [ICoinsFreeRoundReeling, ...ReelRoundReelingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundPresenting() {
    return this.Transit(ICoinsFreeRoundPresenting);
  }
}

EgtALogCategoryClass(CoinsFreeRoundReelingState, 'CoinsFreeRoundReelingState');
