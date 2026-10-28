// Egt::Game::AlphaFamily::GambleRoundStartingState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundStarting):
// asks the gameflow for the gamble's result, and keeps it in the gamble's history.

import { State } from '@game/engine/Fsm/Fsm';
import { assert, AssertUnless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { StartRoundRequest, type StartRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IGambleRound, IGambleRoundReeling, IGambleRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IGambleRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import { GambleRoundStorage } from './GambleRound.data';

export class GambleRoundStartingState extends State {
  static Interfaces = [IGambleRoundStarting];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IGambleRound).SetupViews({ autoSelectInfoPage: isRecovery });

    this.GamblesViewStartSpinning();

    if (!isRecovery) {
      this.RequestStartRound();
    }
  }

  ToRoundReeling() {
    return this.Transit(IGambleRoundReeling);
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startRoundReply, this.OnStartRoundReply);
  }

  private GamblesViewStartSpinning() {
    // show reeling anim while waiting for reply
    this.RuntimeGet(IGambleRoundView).ShowIdle(); // StartSpinning();
  }

  private RequestStartRound() {
    const storage = this.ConstNvram(GambleRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    const input = storage.roundInput!;

    const gameflow = this.RuntimeGetConst(IGameflow);
    if (AssertUnless(gameflow.HasMatchCurrenciesAvailable(input.consume))) return this.Reject();

    const request = new StartRoundRequest();
    request.roundInput = input;

    EgtATrace('RequestStartRound type={}', input.roundType);
    this.RuntimeGet(IGameflow).RequestStartRound(request);
    return this.Consume();
  }

  private OnStartRoundReply(reply: StartRoundReply) {
    const storage = this.Nvram(GambleRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    storage.roundResult = reply.roundResult;
    this.Parent(IGameManager).AddHistoryResult(reply.roundResult);

    return this.ToRoundReeling();
  }
}

EgtALogCategoryClass(GambleRoundStartingState, 'GambleRoundStartingState');
