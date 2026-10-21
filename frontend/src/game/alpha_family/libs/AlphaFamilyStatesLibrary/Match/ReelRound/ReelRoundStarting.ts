// Egt::Game::AlphaFamily::ReelRoundStartingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundStarting): starts
// the reels and asks the gameflow for the round's result.

import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import { assert, AssertUnless } from '@game/engine/GameCore/Common/Defensive';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { StartRoundRequest, type StartRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IReelRound, IReelRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { ReelRoundStatics, ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundStartingState extends State {
  static Interfaces = [IReelRoundStarting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.Static(ReelRoundStatics).requestedFastStop = false;
    this.Parent(IBetManager).SetInitialBetModified(false);

    this.AttachCallbacks();

    this.RefreshViews();

    if (!_isRecovery) {
      this.RequestStartRound();
    }
  }

  abstract ToRoundReeling(): Reaction;

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startRoundReply, this.OnStartRoundReply);

    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
  }

  private RefreshViews() {
    const roundType = this.Parent(IReelRound).GetRoundType();
    this.Parent(IViewManager).SetupViews(roundType, {
      startReeling: true,
      showSpinReelsCombinations: false,
      overrideFakeReels: roundType,
      autoSelectInfoPage: true,
      disableInfoButton: true,
    });
  }

  private RequestStartRound() {
    const storage = this.ConstNvram(ReelRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    const input = storage.roundInput!;

    const gameflow = this.RuntimeGetConst(IGameflow);
    if (AssertUnless(gameflow.HasMatchCurrenciesAvailable(input.consume))) return;

    const request = new StartRoundRequest();
    request.roundInput = input;
    request.showFastLines = this.ConstParent(IGameManager).IsAutoPlayOn();

    EgtATrace('RequestStartRound type={}', input.roundType);
    this.RuntimeGet(IGameflow).RequestStartRound(request);
  }

  private OnStartRoundReply(reply: StartRoundReply) {
    const storage = this.Nvram(ReelRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    storage.roundResult = reply.roundResult;

    const statics = this.Static(ReelRoundStatics);
    statics.showFastLines = reply.showFastLines;

    return this.ToRoundReeling();
  }

  private OnStartHwButtonPressed() {
    this.Static(ReelRoundStatics).requestedFastStop = true;

    return this.Forward();
  }
}

EgtALogCategoryClass(ReelRoundStartingState, 'ReelRoundStartingState');
