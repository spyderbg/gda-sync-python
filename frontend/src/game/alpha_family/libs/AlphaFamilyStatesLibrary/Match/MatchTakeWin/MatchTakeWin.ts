// Egt::Game::AlphaFamily::MatchTakeWinState (AlphaFamilyStatesLibrary/Match/MatchTakeWin): the match's win is taken,
// or gambled (BurningCrownTetraSpins10 has no gamble round rules: it goes on to taxation or the match's end).

import { State } from '@game/engine/Fsm/Fsm';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import {
  HwButtonLight, IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IExitHwButton, IGambleHwButton, IStartHwButton,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ISystemManager } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICreditTaxation } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICreditTaxation';
import { IGambleRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IMatchEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEnding';
import { IMatchTakeWin } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchTakeWin';
import { IExitGameSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class MatchTakeWinState extends State {
  static Interfaces = [IMatchTakeWin];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    if (this.CanEnterGamble()) {
      this.AttachCallbacks();
      this.RefreshViews();
    } else if (this.CheckForTax()) {
      this.TransitLater(ICreditTaxation);
    } else {
      this.TransitLater(IMatchEnding);
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.TakeWin);
    this.ReactOn(this.RuntimeGetConst(ICollectHwButton.Events).buttonPressedEvent, this.TakeWin);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.TakeWinFast);
    this.ReactOn(this.RuntimeGetConst(IExitHwButton.Events).buttonPressedEvent, this.TakeWinAndExit);
    this.ReactOn(this.RuntimeGetConst(IGambleHwButton.Events).buttonPressedEvent, this.EnterGamble);

    // sw button
    this.ReactOn(this.RuntimeGetConst(IExitGameSwButtonView.Events).buttonPressedEvent, this.TakeWinAndExit);
  }

  private RefreshViews() {
    const matchCreditsAvailable = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);
    const matchOnLoss = matchCreditsAvailable <= 0;
    this.Parent(IViewManager).SetupViewsLastResult({
      enableButtons: false,
      showSpinReelsCombinations: !matchOnLoss,
      overrideSpecialRoundView: RoundType.Gamble,
    });

    // hw buttons
    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: true, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: true, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: true, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: true, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: true, light: HwButtonLight.On });
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: true, light: HwButtonLight.BlinkSlowA });
  }

  private EnterGamble() {
    return this.Transit(IGambleRound);
  }

  private TakeWin() {
    if (this.CheckForTax()) {
      return this.Transit(ICreditTaxation);
    }

    return this.Transit(IMatchEnding);
  }

  private TakeWinFast() {
    /// AutoPlayHwButton disable should be handled in GameManager!!!
    if (this.Parent(IGameManager).IsAutoPlayOn()) return this.Forward();

    this.Parent(IGameManager).SetAutoPlay(true);
    this.RuntimeGet(IStartHwButton).SimulateButtonPress();
    return this.Consume();
  }

  private TakeWinAndExit() {
    this.Parent(ISystemManager).RequestPendingExit();

    return this.TakeWin();
  }

  private CanEnterGamble() {
    if (this.ConstParent(IGameManager).IsAutoPlayOn()) return false;
    if (Unless(this.RuntimeGetConst(IMathRules).HasWheelRoundRules(RoundType.Gamble))) return false;

    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    const limits = this.RuntimeTryGetConst(ILimits);

    if (limits && available.Get(Currency.Credits) * 2 > limits.GetWinCapping().capping) return false;

    const hasEnteredGambleRound: boolean = this.ConstParent(IGameManager).GetHasEnteredRound(RoundType.Gamble);
    const hasCurrencyToGamble: boolean = (available.Get(Currency.GambleToken) > 0) && (available.Get(Currency.Credits) > 0);
    const consumed = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesConsumed();
    const hasPlayedCoinWheel: boolean = consumed.Get(Currency.WheelToken) > 0;
    let canGamble: boolean = hasCurrencyToGamble && !hasEnteredGambleRound && !hasPlayedCoinWheel;

    return canGamble;
  }

  private CheckForTax() {
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    const credits = available.Get(Currency.Credits);

    const limits = this.RuntimeTryGetConst(ILimits);

    return limits!.IsTaxThresholdBreached(credits);
  }
}

EgtALogCategoryClass(MatchTakeWinState, 'MatchTakeWinState');
