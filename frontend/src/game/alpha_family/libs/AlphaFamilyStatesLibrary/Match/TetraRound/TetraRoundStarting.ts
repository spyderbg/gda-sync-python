// Egt::Game::AlphaFamily::TetraRoundStartingState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundStarting):
// starts the four sub screens' reels and asks the gameflow for the round's result.

import { State } from '@game/engine/Fsm/Fsm';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { assert, AssertUnless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { StartRoundRequest, type StartRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ITetraRound, ITetraRoundPresenting, ITetraRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { TetraRoundStatics, TetraRoundStorage } from './TetraRound.data';

export class TetraRoundStartingState extends State {
  static Interfaces = [ITetraRoundStarting];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(ITetraRound).GetRoundType(), isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');
    void isStartup;

    this.Static(TetraRoundStatics).requestedFastStop = false;
    this.Parent(IBetManager).SetInitialBetModified(false);

    this.AttachCallbacks();

    this.Parent(ITetraRound).SetupViews({
      autoSelectInfoPage: true,
      disableInfoButton: true,
      startReeling: true,
    });

    if (!isRecovery) {
      this.RequestStartRound();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startRoundReply, this.OnStartRoundReply);

    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
  }

  private RequestStartRound() {
    const storage = this.ConstNvram(TetraRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    const input = storage.roundInput!;

    const gameflow = this.RuntimeGetConst(IGameflow);
    if (AssertUnless(gameflow.HasMatchCurrenciesAvailable(input.consume))) return;

    const request = new StartRoundRequest();
    request.roundInput = input;
    request.showFastLines = this.Parent(IGameManager).IsAutoPlayOn();

    EgtATrace('RequestStartRound type={}', input.roundType);
    this.RuntimeGet(IGameflow).RequestStartRound(request);
  }

  private OnStartRoundReply(reply: StartRoundReply) {
    const storage = this.Nvram(TetraRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    storage.roundResult = reply.roundResult;

    const statics = this.Static(TetraRoundStatics);
    statics.showFastLines = reply.showFastLines;

    return this.ToRoundPresenting();
  }

  private OnStartHwButtonPressed() {
    this.Static(TetraRoundStatics).requestedFastStop = true;

    return this.Forward();
  }

  ToRoundPresenting() {
    return this.Transit(ITetraRoundPresenting);
  }
}

EgtALogCategoryClass(TetraRoundStartingState, 'TetraRoundStartingState');
