// Egt::Game::AlphaFamily::MatchEndingState (AlphaFamilyStatesLibrary/Match/MatchEnding): ends the match with the
// gameflow, which pays its credits to the wallet.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndMatchRequest, type EndMatchReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { GameManagerStatics } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IMatchEndOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEndOutro';
import { IMatchEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEnding';

export class MatchEndingState extends State {
  static Interfaces = [IMatchEnding];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const matchCreditsAvailable = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);
    const matchOnLoss = matchCreditsAvailable <= 0;
    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: !matchOnLoss });

    if (!_isRecovery) {
      this.RequestEndMatch();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endMatchReply, this.OnEndMatchReply);
  }

  private RequestEndMatch() {
    const request = new EndMatchRequest();
    this.RuntimeGet(IGameflow).RequestEndMatch(request);
  }

  OnEndMatchReply(_reply: EndMatchReply) {
    // net win
    this.Static(GameManagerStatics).lastMatchWin = _reply.totalMatchWin;

    return this.Transit(IMatchEndOutro);
  }
}

EgtALogCategoryClass(MatchEndingState, 'MatchEndingState');
