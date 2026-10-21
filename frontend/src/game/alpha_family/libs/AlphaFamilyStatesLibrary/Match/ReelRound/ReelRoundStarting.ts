// Egt::Game::AlphaFamily::ReelRoundStartingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundStarting): starts
// the reels and asks the gameflow for the round's result.

import { Reaction, State } from '@game/engine/Fsm/Fsm';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import type { StartRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IReelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { ReelRoundStatics, ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundStartingState extends State {
  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    this.Static(ReelRoundStatics).requestedFastStop = false;
    this.Parent(IBetManager).SetInitialBetModified(false);
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startRoundReply, this.OnStartRoundReply);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
    this.RefreshViews();
    if (!isRecovery) this.RequestStartRound();
  }

  protected abstract ToRoundReeling(): Reaction;

  private RefreshViews() {
    const roundType = this.Parent(IReelRound).GetRoundType();
    this.Parent(IViewManager).SetupViews(roundType, {
      startReeling: true, showSpinReelsCombinations: false, overrideFakeReels: roundType, autoSelectInfoPage: true, disableInfoButton: true,
    });
  }

  private RequestStartRound() {
    const storage = this.ConstNvram(ReelRoundStorage);
    const input = storage.roundInput!;
    if (!this.RuntimeGetConst(IGameflow).HasMatchCurrenciesAvailable(input.consume)) {
      console.error('ReelRoundStarting: the match has not the currencies the round consumes');
      return;
    }
    this.RuntimeGet(IGameflow).RequestStartRound({ roundInput: input });
  }

  OnStartRoundReply(reply: StartRoundReply) {
    this.Nvram(ReelRoundStorage).roundResult = reply.roundResult;
    return this.ToRoundReeling();
  }

  OnStartHwButtonPressed() {
    this.Static(ReelRoundStatics).requestedFastStop = true;
    return this.Forward();
  }
}
