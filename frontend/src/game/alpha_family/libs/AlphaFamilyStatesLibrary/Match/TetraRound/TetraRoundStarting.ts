// Egt::Game::AlphaFamily::TetraRoundStartingState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundStarting):
// starts the four sub screens' reels and asks the gameflow for the round's result.

import { State } from '../../../../../engine/Fsm/Fsm';
import { IStartHwButton } from '../../../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { IGameflow } from '../../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import type { StartRoundReply } from '../../../AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '../../../AlphaFamily/States/IBetManager';
import { ITetraRound, ITetraRoundPresenting, ITetraRoundStarting } from '../../../AlphaFamily/States/Match/ITetraRound';
import { TetraRoundStatics, TetraRoundStorage } from './TetraRound.data';

export class TetraRoundStartingState extends State {
  static Interfaces = [ITetraRoundStarting];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    this.Static(TetraRoundStatics).requestedFastStop = false;
    this.Parent(IBetManager).SetInitialBetModified(false);
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startRoundReply, this.OnStartRoundReply);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
    this.Parent(ITetraRound).SetupViews({ autoSelectInfoPage: true, disableInfoButton: true, startReeling: true });
    if (!isRecovery) this.RequestStartRound();
  }

  private RequestStartRound() {
    const input = this.ConstNvram(TetraRoundStorage).roundInput!;
    if (!this.RuntimeGetConst(IGameflow).HasMatchCurrenciesAvailable(input.consume)) {
      console.error('TetraRoundStarting: the match has not the credits the round consumes');
      return;
    }
    this.RuntimeGet(IGameflow).RequestStartRound({ roundInput: input });
  }

  OnStartRoundReply(reply: StartRoundReply) {
    this.Nvram(TetraRoundStorage).roundResult = reply.roundResult;
    return this.ToRoundPresenting();
  }

  OnStartHwButtonPressed() {
    this.Static(TetraRoundStatics).requestedFastStop = true;
    return this.Forward();
  }

  ToRoundPresenting() {
    return this.Transit(ITetraRoundPresenting);
  }
}
