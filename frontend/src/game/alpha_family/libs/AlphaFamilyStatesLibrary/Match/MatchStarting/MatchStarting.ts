// Egt::Game::AlphaFamily::MatchStartingState (AlphaFamilyStatesLibrary/Match/MatchStarting): asks the gameflow to
// start a match at the bet; a match always starts from the main round.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtADebug, EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { StartMatchRequest, type StartMatchReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IIdle } from '@game/alpha_family/libs/AlphaFamily/States/Idle/IIdle';
import { IMainRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { IMatchStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchStarting';

export class MatchStartingState extends State {
  static Interfaces = [IMatchStarting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: false, resetLeftStatusLine: true });

    if (!_isRecovery) {
      this.RequestStartMatch();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startMatchReply, this.OnStartMatchReply);
  }

  private RequestStartMatch() {
    const betManager = this.Parent(IBetManager);

    const request = new StartMatchRequest();
    request.bet = betManager.GetInitialBet();
    this.RuntimeGet(IGameflow).RequestStartMatch(request);
  }

  OnStartMatchReply(reply: StartMatchReply) {
    EgtATrace('MatchStartingState::OnStartMatchReply');

    if (!reply.approved) {
      EgtADebug('StartMatchRequest not approved! => disable auto play and return to idle state');
      this.Parent(IGameManager).SetAutoPlay(false);
      return this.Transit(IIdle);
    }

    // Override current bet if it changed
    const betManager = this.Parent(IBetManager);
    betManager.SetCurrentBet(reply.bet);

    // Match always starts from main round.
    return this.Transit(IMainRound);
  }
}

EgtALogCategoryClass(MatchStartingState, 'MatchStartingState');
