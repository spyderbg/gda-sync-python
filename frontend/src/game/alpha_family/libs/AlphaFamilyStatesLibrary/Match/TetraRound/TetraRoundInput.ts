// Egt::Game::AlphaFamily::TetraRoundInputState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundInput): waits for
// START (with the bet the player chooses) or COLLECT, which ends the tetra round.

import { State } from '../../../../../engine/Fsm/Fsm';
import { Currencies } from '../../../../../engine/Game/Math/Common.data';
import { IAutoPlayHwButton, ICashoutHwButton, IStartHwButton } from '../../../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { Currency } from '../../../AlphaFamily/Math/Common/Common.data';
import { IBetManager } from '../../../AlphaFamily/States/IBetManager';
import { IGameManager } from '../../../AlphaFamily/States/IGameManager';
import { ISystemManager } from '../../../AlphaFamily/States/ISystemManager';
import {
  ITetraRound, ITetraRoundInput, ITetraRoundOutro, ITetraRoundStarting,
} from '../../../AlphaFamily/States/Match/ITetraRound';
import { IExitTetraSwButtonView } from '../../../AlphaFamily/Views/SwButtonViews.bridge';
import { TetraRoundStorage } from './TetraRound.data';

export class TetraRoundInputState extends State {
  static Interfaces = [ITetraRoundInput];

  OnTransit(isStartup: boolean) {
    this.AttachCallbacks();
    this.RefreshViews(isStartup);
    if (this.Parent(IGameManager).IsAutoPlayOn()) this.RuntimeGet(IStartHwButton).SimulateButtonPress();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.OnAutoPlayHwButtonPressed);
    this.ReactOn(this.Parent(IBetManager.Events).betChanged, this.OnBetChanged);
    this.ReactOn(this.RuntimeGetConst(ICashoutHwButton.Events).buttonPressedEvent, this.OnCashoutButtonPressed);
    const collectTetraButtonEvents = this.RuntimeTryGetConst(IExitTetraSwButtonView.Events);
    if (collectTetraButtonEvents) this.ReactOn(collectTetraButtonEvents.buttonPressedEvent, this.OnCollectTetraButtonPressed);
  }

  ToRoundStarting() {
    return this.Transit(ITetraRoundStarting);
  }

  private RefreshViews(autoSelectInfoPage: boolean) {
    this.Parent(ITetraRound).SetupViews({ autoSelectInfoPage, enableButtons: true, enableInput: true });
  }

  private SetupBetInput() {
    const betManager = this.Parent(IBetManager);
    const subscreens = this.Parent(ITetraRound).GetRoundRules().GetTetraSpinRules().GetSubScreenCount();
    const currentBet = betManager.GetCurrentBet();
    const input = this.Nvram(TetraRoundStorage).roundInput!;
    input.bet = currentBet;
    input.lines = betManager.GetCurrentLines();
    input.betPerLine = input.bet / (subscreens * input.lines);
    input.consume = new Currencies(Currency.Credits, currentBet);
  }

  OnStartHwButtonPressed() {
    this.SetupBetInput();
    return this.ToRoundStarting();
  }

  OnAutoPlayHwButtonPressed() {
    if (this.Parent(IGameManager).IsAutoPlayOn()) return this.Skip();
    this.Parent(IGameManager).SetAutoPlay(true);
    this.RuntimeGet(IStartHwButton).SimulateButtonPress();
    return this.Consume();
  }

  OnBetChanged(_bet: number) {
    this.Parent(IBetManager).SetInitialBetFromCurrent();
    this.RefreshViews(true);
    return this.Forward();
  }

  OnCashoutButtonPressed() {
    this.Parent(ISystemManager).RequestPendingCashout();
    // Fixed in the browser game: C++ goes to TetraRoundPresenting, which has no round to present at the input (the last
    // one has ended, or none has started), so TetraRoundEnding requests the end of a round that does not exist and the
    // gameflow throws. Like the exit tetra button, Cashout ends the tetra rounds here.
    return this.Transit(ITetraRoundOutro);
  }

  OnCollectTetraButtonPressed() {
    return this.Transit(ITetraRoundOutro);
  }
}
