// Egt::Game::AlphaFamily::MatchEndingState (AlphaFamilyStatesLibrary/Match/MatchEnding): ends the match with the
// gameflow, which pays its credits to the wallet.

import { State } from '../../../../../engine/Fsm/Fsm';
import { Currency, RoundType } from '../../../AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '../../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import type { EndMatchReply } from '../../../AlphaFamily/RuntimeImport/IGameflow.data';
import { GameManagerStatics } from '../../../AlphaFamily/States/IGameManager';
import { IViewManager } from '../../../AlphaFamily/States/IViewManager';
import { IMatchEndOutro } from '../../../AlphaFamily/States/Match/IMatchEndOutro';
import { IMatchEnding } from '../../../AlphaFamily/States/Match/IMatchEnding';

export class MatchEndingState extends State {
  static Interfaces = [IMatchEnding];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endMatchReply, this.OnEndMatchReply);
    const matchOnLoss = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits) <= 0;
    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: !matchOnLoss });
    if (!isRecovery) this.RuntimeGet(IGameflow).RequestEndMatch({});
  }

  OnEndMatchReply(reply: EndMatchReply) {
    // net win
    this.Static(GameManagerStatics).lastMatchWin = reply.totalMatchWin;
    return this.Transit(IMatchEndOutro);
  }
}
