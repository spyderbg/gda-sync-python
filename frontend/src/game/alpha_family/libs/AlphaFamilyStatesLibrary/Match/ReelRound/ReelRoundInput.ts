// Egt::Game::AlphaFamily::ReelRoundInputState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundInput): waits for the player before a reel round.

import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IReelRound, IReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';

export abstract class ReelRoundInputState extends State {
  static Interfaces = [IReelRoundInput];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');
  }

  abstract ToRoundStarting(): Reaction;
}

EgtALogCategoryClass(ReelRoundInputState, 'ReelRoundInputState');
