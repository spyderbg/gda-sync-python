// Egt::Game::AlphaFamily::CoinsRoundInputState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundInput): waits for
// START (with the bet the player chooses), or for taking the coins to the wheel.

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ISystemManager } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICoinsRoundInput, ICoinsRoundOutro, ICoinsRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { IReelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { IWheelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ReelRoundStorage } from '../ReelRound/ReelRound.data';
import { ReelRoundInputState } from '../ReelRound/ReelRoundInput';

export class CoinsRoundInputState extends ReelRoundInputState {
  static Interfaces = [ICoinsRoundInput, ...ReelRoundInputState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);

    this.AttachCallbacks();

    this.RefreshViews();

    if (this.Parent(IGameManager).IsAutoPlayOn()) {
      this.RuntimeGet(IStartHwButton).SimulateButtonPress();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.OnAutoPlayHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(ICollectHwButton.Events).buttonPressedEvent, this.OnTakeCoinsButtonPressed);

    this.ReactOn(this.Parent(IBetManager.Events).betChanged, this.OnBetChanged);
    this.ReactOn(this.RuntimeGetConst(ITakeCoinsSwButtonView.Events).buttonPressedEvent, this.OnTakeCoinsButtonPressed);
    this.ReactOn(this.RuntimeGetConst(ICashoutHwButton.Events).buttonPressedEvent, this.OnCashoutButtonPressed);

    const viewManagerEvents = this.Parent(IViewManager.Events);
    this.ReactOn(viewManagerEvents.betMenuStateChanged, this.OnMenuStateChanged);
    this.ReactOn(viewManagerEvents.languageMenuStateChanged, this.OnMenuStateChanged);
  }

  ToRoundStarting() {
    return this.Transit(ICoinsRoundStarting);
  }

  private RefreshViews(autoSelectInfoPage = false) {
    this.Parent(IViewManager).SetupViews(RoundType.Coins, {
      enableButtons: true,
      autoSelectInfoPage: autoSelectInfoPage,
      overrideSpecialRoundView: RoundType.Coins,
    });
  }

  private SetupBetInput() {
    const betManager = this.Parent(IBetManager);
    const rules = this.Parent(IReelRound).GetRoundRules();

    const storage = this.Nvram(ReelRoundStorage);
    assert(storage.roundInput);
    const input = storage.roundInput!;

    input.roundType = RoundType.Coins;
    input.bet = betManager.GetCurrentBet();
    input.betType = Currency.CoinsSpinEnergy;
    input.betPerLine = input.bet / input.lines;
    input.consume = new Currencies(Currency.CoinsSpinEnergy, input.bet);
    input.initialMatchCreditBet = this.RuntimeGetConst(IGameflow).GetInitialCreditsBet();

    if (rules.HasLeftOver()) {
      const currentEnergy = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy);
      const consumeEnergy = Math.min(currentEnergy, input.bet);
      input.consume = new Currencies(Currency.CoinsSpinEnergy, consumeEnergy);
    }
  }

  private OnStartHwButtonPressed() {
    this.SetupBetInput();

    return this.ToRoundStarting();
  }

  private OnAutoPlayHwButtonPressed() {
    if (this.Parent(IGameManager).IsAutoPlayOn()) return this.Skip();

    this.Parent(IGameManager).SetAutoPlay(true);
    this.RuntimeGet(IStartHwButton).SimulateButtonPress();
    return this.Consume();
  }

  private OnBetChanged(_bet: number) {
    const betManager = this.Parent(IBetManager);
    betManager.SetInitialBetFromCurrent();

    this.RefreshViews(true);

    return this.Forward();
  }

  private OnTakeCoinsButtonPressed() {
    if (this.RuntimeGetConst(IMathRules).HasWheelRoundRules(RoundType.Wheel)) {
      return this.Transit(IWheelRound);
    }

    return this.Transit(ICoinsRoundOutro);
  }

  private OnCashoutButtonPressed() {
    this.Parent(ISystemManager).RequestPendingCashout();
    if (this.RuntimeGetConst(IMathRules).HasWheelRoundRules(RoundType.Wheel)) {
      return this.Transit(IWheelRound);
    }

    return this.Transit(ICoinsRoundOutro);
  }

  private OnMenuStateChanged() {
    this.RefreshViews();
    return this.Forward();
  }
}

EgtALogCategoryClass(CoinsRoundInputState, 'CoinsRoundInputState');
