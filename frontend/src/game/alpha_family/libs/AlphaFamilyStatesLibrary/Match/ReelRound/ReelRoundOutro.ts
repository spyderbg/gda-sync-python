// Egt::Game::AlphaFamily::ReelRoundOutroState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundOutro): the splash after a reel round.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IReelRound, IReelRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';

export abstract class ReelRoundOutroState extends State {
  static Interfaces = [IReelRoundOutro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');
  }
}

EgtALogCategoryClass(ReelRoundOutroState, 'ReelRoundOutroState');
