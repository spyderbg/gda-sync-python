// Egt::Game::AlphaFamily::CoinsRoundEndingState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundEnding): the
// next coins round's input while the match has coins, else the outro.

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ICoinsRoundEnding, ICoinsRoundInput, ICoinsRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { ReelRoundEndingState } from '../ReelRound/ReelRoundEnding';

export class CoinsRoundEndingState extends ReelRoundEndingState {
  static Interfaces = [ICoinsRoundEnding, ...ReelRoundEndingState.Interfaces];

  ToRoundOutro() {
    if (this.RuntimeGetConst(IGameflow).GetNextRoundType() === RoundType.Coins) {
      return this.Transit(ICoinsRoundInput);
    } else {
      return this.Transit(ICoinsRoundOutro);
    }
  }
}

EgtALogCategoryClass(CoinsRoundEndingState, 'CoinsRoundEndingState');
