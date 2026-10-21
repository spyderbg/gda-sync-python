// Egt::Game::AlphaFamily::MainRoundReelingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundReeling).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IMainRoundPresenting, IMainRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { ReelRoundReelingState } from '../ReelRound/ReelRoundReeling';

export class MainRoundReelingState extends ReelRoundReelingState {
  static Interfaces = [IMainRoundReeling, ...ReelRoundReelingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundPresenting() {
    return this.Transit(IMainRoundPresenting);
  }
}

EgtALogCategoryClass(MainRoundReelingState, 'MainRoundReelingState');
