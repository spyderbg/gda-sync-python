// Egt::Game::AlphaFamily::MatchStartingState (AlphaFamilyStatesLibrary/Match/MatchStarting): asks the gameflow to
// start a match at the bet; a match always starts from the main round.

import { State } from '@game/engine/Fsm/Fsm';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import type { StartMatchReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IIdle } from '@game/alpha_family/libs/AlphaFamily/States/Idle/IIdle';
import { IMainRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { IMatchStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchStarting';

export class MatchStartingState extends State {
  static Interfaces = [IMatchStarting];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startMatchReply, this.OnStartMatchReply);
    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: false, resetLeftStatusLine: true });
    if (!isRecovery) this.RuntimeGet(IGameflow).RequestStartMatch({ bet: this.Parent(IBetManager).GetInitialBet() });
  }

  OnStartMatchReply(reply: StartMatchReply) {
    if (!reply.approved) {
      this.Parent(IGameManager).SetAutoPlay(false);
      return this.Transit(IIdle);
    }
    // Override current bet if it changed
    this.Parent(IBetManager).SetCurrentBet(reply.bet);
    // Match always starts from main round.
    return this.Transit(IMainRound);
  }
}
