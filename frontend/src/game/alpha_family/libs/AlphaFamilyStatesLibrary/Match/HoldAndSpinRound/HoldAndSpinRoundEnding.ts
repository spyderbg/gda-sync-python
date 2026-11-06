// Egt::Game::AlphaFamily::HoldAndSpinRoundEndingState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundEnding):
// ends the round with the gameflow; the outro shows what it won.

import { State } from '@game/engine/Fsm/Fsm';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndRoundRequest, type EndRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IHoldAndSpinRound, IHoldAndSpinRoundEnding, IHoldAndSpinRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

export class HoldAndSpinRoundEndingState extends State {
  static Interfaces = [IHoldAndSpinRoundEnding];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IHoldAndSpinRound).SetupViews(
      { disableInfoButton: true, showMainInfo: true, showSpinsCompletedWhenExhausted: true });

    if (!_isRecovery) {
      this.RequestEndRound();
    }
  }

  ToRoundOutro() {
    return this.Transit(IHoldAndSpinRoundOutro);
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
  }

  private RequestEndRound() {
    const request = new EndRoundRequest();
    this.RuntimeGet(IGameflow).RequestEndRound(request);
  }

  OnEndRoundReply(_reply: EndRoundReply) {
    this.StoreLastRoundResult();
    return this.ToRoundOutro();
  }

  private StoreLastRoundResult() {
    const storage = this.Nvram(HoldAndSpinRoundStorage);
    if (AssertIf(!storage.roundResult)) return;

    this.Parent(IGameManager).SetLastRoundResult(storage.roundResult!);
    storage.roundResult = null;
  }
}

EgtALogCategoryClass(HoldAndSpinRoundEndingState, 'HoldAndSpinRoundEndingState');
