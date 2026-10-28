// Egt::Game::AlphaFamily::GambleRoundInputState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundInput): slides
// the cards, then waits for red or black, or the win to be taken (START, COLLECT), cashed out or the game exited.

import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import {
  ICashoutHwButton, ICollectHwButton, IExitHwButton, IGambleBlackHwButton, IGambleRedHwButton, IStartHwButton,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { WheelSectorGroupId } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ISystemManager } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import {
  IGambleRound, IGambleRoundInput, IGambleRoundOutro, IGambleRoundStarting,
} from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IGambleRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import {
  IExitGameSwButtonView, IGambleBlackSwButtonView, IGambleRedSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { GambleRoundStorage } from './GambleRound.data';

export class GambleRoundInputState extends State {
  static Interfaces = [IGambleRoundInput];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.SetupBetInput();

    // shuffle cards
    this.Parent(IGambleRound).SetupViews({ enableInput: true, autoSelectInfoPage: isRecovery });
    this.RuntimeGet(IGambleRoundView).ShowSlideCards();
  }

  private AttachCallbacks() {
    this.ReactOn(
      this.RuntimeGetConst(IGambleRoundView.Events).slideCardsFinished, this.ToRoundActiveInput);
    this.ReactOn(
      this.RuntimeGetConst(IGambleRedSwButtonView.Events).buttonPressedEvent,
      this.ToRoundStartingRed);
    this.ReactOn(
      this.RuntimeGetConst(IGambleBlackSwButtonView.Events).buttonPressedEvent,
      this.ToRoundStartingBlack);
    this.ReactOn(this.RuntimeGetConst(IExitGameSwButtonView.Events).buttonPressedEvent, this.ExitGame);
    // hw buttons
    this.ReactOn(this.RuntimeGetConst(IExitHwButton.Events).buttonPressedEvent, this.ExitGame);
    this.ReactOn(this.RuntimeGetConst(ICashoutHwButton.Events).buttonPressedEvent, this.CashOut);
    this.ReactOn(this.RuntimeGetConst(ICollectHwButton.Events).buttonPressedEvent, this.TakeWin);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.TakeWin);
    this.ReactOn(
      this.RuntimeGetConst(IGambleRedHwButton.Events).buttonPressedEvent, this.ToRoundStartingRed);
    this.ReactOn(
      this.RuntimeGetConst(IGambleBlackHwButton.Events).buttonPressedEvent,
      this.ToRoundStartingBlack);
  }

  private RefreshViews() {
    this.Parent(IGambleRound).SetupViews({ enableInput: true });
  }

  private ToRoundActiveInput() {
    this.RuntimeGet(IGambleRoundView).ShowIdle();
    this.RefreshViews();
    return this.Consume();
  }

  private ToRoundStartingRed() {
    return this.ToRoundStarting(this.PLAYER_CHOICE_RED);
  }

  private ToRoundStartingBlack() {
    return this.ToRoundStarting(this.PLAYER_CHOICE_BLACK);
  }

  private ToRoundStarting(playersChoice: WheelSectorGroupId) {
    this.SetupBetInput(playersChoice);

    return this.Transit(IGambleRoundStarting);
  }

  private TakeWin() {
    return this.Transit(IGambleRoundOutro);
  }

  private ExitGame() {
    this.Parent(ISystemManager).RequestPendingExit();

    return this.Transit(IGambleRoundOutro);
  }

  private CashOut() {
    this.Parent(ISystemManager).RequestPendingCashout();

    return this.Transit(IGambleRoundOutro);
  }

  private SetupBetInput(playersChoice: WheelSectorGroupId = -1) {
    const currentCreditsRisked = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);
    const storage = this.Nvram(GambleRoundStorage);
    assert(storage.roundInput);
    const input = storage.roundInput!;

    input.bet = currentCreditsRisked;
    input.betGroup = playersChoice;
    input.consume = new Currencies(Currency.GambleToken, 1).Plus(new Currencies(Currency.Credits, currentCreditsRisked));
  }

  private readonly PLAYER_CHOICE_RED: WheelSectorGroupId = 0;
  private readonly PLAYER_CHOICE_BLACK: WheelSectorGroupId = 1;
}

EgtALogCategoryClass(GambleRoundInputState, 'GambleRoundInputState');
