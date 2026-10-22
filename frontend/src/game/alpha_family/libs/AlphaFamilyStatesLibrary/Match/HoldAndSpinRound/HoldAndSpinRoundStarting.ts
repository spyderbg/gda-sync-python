// Egt::Game::AlphaFamily::HoldAndSpinRoundStartingState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundStarting):
// starts the reels and asks the gameflow for the round's result.

import { State } from '@game/engine/Fsm/Fsm';
import { assert, AssertUnless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { StartRoundRequest, type StartRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IHoldAndSpinRound, IHoldAndSpinRoundReeling, IHoldAndSpinRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

export class HoldAndSpinRoundStartingState extends State {
  static Interfaces = [IHoldAndSpinRoundStarting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true, startReeling: true, showMainInfo: true });

    if (!_isRecovery) {
      this.RequestStartRound();
    }
  }

  private AttachCallbacks() {
    const ev = this.RuntimeGetConst(IGameflow.Events);
    this.ReactOn(ev.startRoundReply, this.OnStartRoundReply);
  }

  private RequestStartRound() {
    const storage = this.ConstNvram(HoldAndSpinRoundStorage);
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

  OnStartRoundReply(reply: StartRoundReply) {
    const storage = this.Nvram(HoldAndSpinRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    storage.roundResult = reply.roundResult;

    return this.ToRoundReeling();
  }

  ToRoundReeling() {
    return this.Transit(IHoldAndSpinRoundReeling);
  }
}

EgtALogCategoryClass(HoldAndSpinRoundStartingState, 'HoldAndSpinRoundStartingState');
