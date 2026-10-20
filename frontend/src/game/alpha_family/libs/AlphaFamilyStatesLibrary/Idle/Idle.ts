// Egt::Game::AlphaFamily::IdleState (AlphaFamilyStatesLibrary/Idle/Idle.h/.cpp): between matches; START begins one.

import { State } from '../../../../engine/Fsm/Fsm';
import { IAutoPlayHwButton, ICashoutHwButton, IExitHwButton, IStartHwButton } from '../../../../engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '../../../../engine/Game/RuntimeImport/ILimits';
import { IAppControl, IResponsibleGaming } from '../../../../engine/Game/RuntimeImport/IResponsibleGaming';
import { IWallet, type TransactionInfo } from '../../../../engine/Game/RuntimeImport/IWallet';
import { RoundType } from '../../AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '../../AlphaFamily/RuntimeExport/IMathRules';
import { IBetManager } from '../../AlphaFamily/States/IBetManager';
import { IGameManager } from '../../AlphaFamily/States/IGameManager';
import { ISystemManager } from '../../AlphaFamily/States/ISystemManager';
import { IViewManager } from '../../AlphaFamily/States/IViewManager';
import { IIdle } from '../../AlphaFamily/States/Idle/IIdle';
import { IMatch } from '../../AlphaFamily/States/Match/IMatch';
import { IExitGameSwButtonView, IResponsibleSwButtonView } from '../../AlphaFamily/Views/SwButtonViews.bridge';

export class IdleState extends State {
  static Interfaces = [IIdle];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    this.AttachCallbacks();
    if (this.Parent(ISystemManager).HasPendingCashout() && this.RuntimeGetConst(IWallet).GetCredit() > 0) this.RuntimeGet(IWallet).StartCashout();
    if (this.Parent(ISystemManager).HasPendingExit()) this.RuntimeGet(IExitGameSwButtonView).SimulateButtonPress();
    if (this.RuntimeGetConst(IResponsibleGaming).HasPendingResponsibleGamingWarning()) this.RuntimeGet(IResponsibleGaming).OpenResponsibleGamingWarning();
    if (this.CanStartMatch()) {
      if (this.Parent(IGameManager).IsAutoPlayOn()) this.RuntimeGet(IStartHwButton).SimulateButtonPress();
    } else {
      this.Parent(IGameManager).SetAutoPlay(false);
    }
    this.RefreshViews(true);
    if (isStartup && !isRecovery) this.InitCurrentBet();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IExitGameSwButtonView.Events).buttonPressedEvent, this.OnExitGameSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IExitGameSwButtonView.Events).exitPresentingFinished, this.OnExitPresentingFinished);
    this.ReactOn(this.RuntimeGetConst(IResponsibleSwButtonView.Events).buttonPressedEvent, this.OnResponsibleSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IAutoPlayHwButton.Events).buttonPressedEvent, this.OnAutoPlayHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IExitHwButton.Events).buttonPressedEvent, this.OnExitHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(ICashoutHwButton.Events).buttonPressedEvent, this.OnCashoutHwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCashoutEnd, this.OnCashoutEnd);
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCashoutStart, this.OnCashoutStart);
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCreditChanged, this.OnCreditChanged);
    this.ReactOn(this.RuntimeGetConst(IResponsibleGaming.Events).responsibleGamingWarning, this.OnResponsibleGamingWarning);
    const viewManagerEvents = this.Parent(IViewManager.Events);
    this.ReactOn(viewManagerEvents.betMenuStateChanged, this.OnMenuStateChanged);
    this.ReactOn(viewManagerEvents.languageMenuStateChanged, this.OnMenuStateChanged);
    const betManagerEvents = this.Parent(IBetManager.Events);
    this.ReactOn(betManagerEvents.betChanged, this.OnBetChanged);
    this.ReactOn(betManagerEvents.linesChanged, this.OnLinesChanged);
    this.ReactOn(betManagerEvents.startMatchRequested, this.OnStartMatchRequested);
    this.ReactOn(this.RuntimeGetConst(IResponsibleGaming.Events).responsibleGamingCashout, this.OnResponsibleGamingStop);
  }

  private InitCurrentBet() {
    const betManager = this.Parent(IBetManager);
    const bets = betManager.GetAllowedBets();
    const lines = betManager.GetAllowedLines();
    let defaultBet = this.RuntimeGetConst(ILimits).GetBetLimits().defaultBet;
    if (defaultBet <= 0) defaultBet = Math.trunc(this.RuntimeGetConst(IWallet).GetCredit() / 100);
    betManager.SetCurrentBet(bets.find(bet => bet >= defaultBet) ?? bets[bets.length - 1]);
    betManager.SetCurrentLines(lines[0]);
  }

  OnStartHwButtonPressed() {
    if (!this.CanStartMatch()) return this.Reject();
    return this.Transit(IMatch);
  }

  OnAutoPlayHwButtonPressed() {
    /// AutoPlayHwButton disable should be handled in GameManager!!!
    if (this.Parent(IGameManager).IsAutoPlayOn()) return this.Skip();
    this.Parent(IGameManager).SetAutoPlay(true);
    this.RuntimeGet(IStartHwButton).SimulateButtonPress();
    return this.Consume();
  }

  OnExitHwButtonPressed() {
    this.RuntimeGet(IExitGameSwButtonView).SimulateButtonPress();
    return this.Consume();
  }

  OnExitGameSwButtonPressed() {
    this.Parent(ISystemManager).RequestPendingExit();
    this.RefreshViews();
    return this.Consume();
  }

  OnCashoutHwButtonPressed() {
    if (this.RuntimeGetConst(IWallet).GetCredit() === 0) return this.Skip();
    this.RuntimeGet(IWallet).StartCashout();
    return this.Consume();
  }

  OnResponsibleSwButtonPressed() {
    this.RuntimeGet(IResponsibleGaming).OpenResponsibleGamingSetupView();
    return this.Forward();
  }

  OnMenuStateChanged() {
    this.RefreshViews();
    return this.Forward();
  }

  OnExitPresentingFinished() {
    if (!this.RuntimeGet(IAppControl).ExitGracefully()) {
      this.Parent(ISystemManager).ClearPendingExit();
      this.RefreshViews();
    }
    return this.Consume();
  }

  OnResponsibleGamingStop() {
    if (this.RuntimeGetConst(IWallet).GetCredit() === 0) return this.Skip();
    this.RuntimeGet(IWallet).StartCashout();
    return this.Consume();
  }

  OnBetChanged(_bet: number) {
    this.Parent(IBetManager).SetInitialBetFromCurrent();
    this.RefreshViews(true);
    return this.Forward();
  }

  OnLinesChanged(_lines: number) {
    this.Parent(IBetManager).SetInitialBetFromCurrent();
    this.RefreshViews(true);
    return this.Forward();
  }

  OnStartMatchRequested() {
    if (!this.CanStartMatch()) return this.Skip();
    return this.Transit(IMatch);
  }

  OnResponsibleGamingWarning() {
    this.RuntimeGet(IResponsibleGaming).OpenResponsibleGamingWarning();
    return this.Forward();
  }

  OnCashoutStart() {
    return this.Skip();
  }

  OnCashoutEnd(success: boolean) {
    if (!success) return this.Skip();
    this.RuntimeGet(IAppControl).ExitGracefully();
    return this.Consume();
  }

  OnCreditChanged(transactionInfo: TransactionInfo) {
    const limits = this.RuntimeGetConst(ILimits).GetBetLimits();
    this.Parent(IBetManager).SetBetLimit(Math.min(transactionInfo.newCreditTotal, limits.maxBet));
    if (!this.CanStartMatch()) this.Parent(IGameManager).SetAutoPlay(false);
    this.RefreshViews();
    return this.Forward();
  }

  private RefreshViews(autoSelectInfoPage = false) {
    const lastMatchWin = this.Parent(IGameManager).GetLastMatchWin();
    this.Parent(IViewManager).SetupViews(RoundType.Main, {
      blockGameInput: this.Parent(ISystemManager).HasPendingExit(),
      enableButtons: true,
      showSpinReelsCombinations: lastMatchWin > 0,
      autoSelectInfoPage,
      overrideSpecialRoundView: RoundType.Main,
    });
  }

  GetMainRules() {
    return this.RuntimeGetConst(IMathRules).GetReelRoundRules(RoundType.Main);
  }

  private CanStartMatch() {
    const bet = this.Parent(IBetManager).GetCurrentBet();
    if (bet > this.RuntimeGetConst(IWallet).GetCredit()) return false;
    return !this.RuntimeGetConst(IResponsibleGaming).HasPendingResponsibleGamingWarning();
  }
}
