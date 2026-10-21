// Egt::Game::AlphaFamily::MainRoundEndingState (AlphaFamilyStatesLibrary/Match/MainRound/MainRoundEnding).

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IMainRoundEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { ReelRoundEndingState } from '../ReelRound/ReelRoundEnding';

export class MainRoundEndingState extends ReelRoundEndingState {
  static Interfaces = [IMainRoundEnding, ...ReelRoundEndingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);
  }

  ToRoundOutro() {
    // Main round has no Outro => jump to next round
    return this.Parent(IMatch).ToNextRound();
  }
}

EgtALogCategoryClass(MainRoundEndingState, 'MainRoundEndingState');
