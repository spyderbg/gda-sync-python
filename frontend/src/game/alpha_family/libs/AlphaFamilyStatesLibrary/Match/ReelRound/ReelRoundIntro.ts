// Egt::Game::AlphaFamily::ReelRoundIntroState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundIntro): the splash before a reel round.

import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IReelRound, IReelRoundIntro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';

export abstract class ReelRoundIntroState extends State {
  static Interfaces = [IReelRoundIntro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');
  }

  abstract ToRoundInput(): Reaction;
}

EgtALogCategoryClass(ReelRoundIntroState, 'ReelRoundIntroState');
