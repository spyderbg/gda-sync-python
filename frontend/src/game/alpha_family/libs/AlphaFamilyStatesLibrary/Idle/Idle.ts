// Egt::Game::AlphaFamily::IdleState (AlphaFamilyStatesLibrary/Idle/Idle.h/.cpp): between matches; START begins one.

import { State } from '@game/engine/Fsm/Fsm';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import { EgtADebug, EgtAInfo, EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { IAutoPlayHwButton, ICashoutHwButton, IExitHwButton, IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { AttendanceDurationType, IAttendance, IAutoExit } from '@game/engine/Game/RuntimeImport/IAttendance';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IAppControl, IResponsibleGaming } from '@game/engine/Game/RuntimeImport/IResponsibleGaming';
import { IWallet, type TransactionInfo } from '@game/engine/Game/RuntimeImport/IWallet';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ISystemManager } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IIdle } from '@game/alpha_family/libs/AlphaFamily/States/Idle/IIdle';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IExitGameSwButtonView, IResponsibleSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class IdleState extends State {
  static Interfaces = [IIdle];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    EgtAInfo('OnTransit {} {}', isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    if (this.Parent(ISystemManager).HasPendingCashout()) {
      const credit = this.RuntimeGetConst(IWallet).GetCredit();
      if (credit > 0) {
        this.RuntimeGet(IWallet).StartCashout();
      }
    }

    if (this.Parent(ISystemManager).HasPendingExit()) {
      this.RuntimeGet(IExitGameSwButtonView).SimulateButtonPress();
    }

    if (this.RuntimeGetConst(IResponsibleGaming).HasPendingResponsibleGamingWarning()) {
      this.RuntimeGet(IResponsibleGaming).OpenResponsibleGamingWarning();
    }

    if (this.CanStartMatch()) {
      if (this.Parent(IGameManager).IsAutoPlayOn()) {
        this.RuntimeGet(IStartHwButton).SimulateButtonPress();
      }
    } else {
      this.Parent(IGameManager).SetAutoPlay(false);
    }

    this.RefreshViews(true);

    if (isStartup && !isRecovery) {
      this.InitCurrentBet();
    }
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

    const attendance = this.RuntimeTryGetConst(IAttendance.Events);
    if (attendance) {
      this.ReactOn(attendance.inactivityTick, this.OnInactivityTick);
    }
    const autoExit = this.RuntimeTryGetConst(IAutoExit.Events);
    if (autoExit) {
      this.ReactOn(autoExit.zeroCreditAfterMatchTimeout, this.OnZeroCreditAfterMatchTimeout);
    }
  }

  private InitCurrentBet() {
    const betManager = this.Parent(IBetManager);
    const bets = betManager.GetAllowedBets();
    const lines = betManager.GetAllowedLines();

    let defaultBet = this.RuntimeGetConst(ILimits).GetBetLimits().defaultBet;
    if (defaultBet <= 0) {
      const credit = this.RuntimeGetConst(IWallet).GetCredit();
      defaultBet = Math.trunc(credit / 100);
    }

    const bet = bets.find(item => item >= defaultBet) ?? bets[bets.length - 1];

    betManager.SetCurrentBet(bet);
    betManager.SetCurrentLines(lines[0]);
  }

  OnStartHwButtonPressed() {
    if (Unless(this.CanStartMatch())) return this.Reject();

    EgtAInfo('OnStartHwButtonPressed -> IMatch');
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
    const credit = this.RuntimeGetConst(IWallet).GetCredit();
    if (credit === 0) return this.Skip();

    this.RuntimeGet(IWallet).StartCashout();
    return this.Consume();
  }

  OnResponsibleSwButtonPressed() {
    // if (auto responsibleEvents = RuntimeTryGetConst<IResponsibleGamingManager::Events>())
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
    const credit = this.RuntimeGetConst(IWallet).GetCredit();
    if (credit === 0) return this.Skip();

    this.RuntimeGet(IWallet).StartCashout();
    return this.Consume();
  }

  OnBetChanged(_bet: number) {
    EgtADebug('OnBetChanged bet={}', _bet);

    const betManager = this.Parent(IBetManager);
    betManager.SetInitialBetFromCurrent();

    this.RefreshViews(true);

    return this.Forward();
  }

  OnLinesChanged(_lines: number) {
    EgtADebug('OnLinesChanged lines={}', _lines);

    const betManager = this.Parent(IBetManager);
    betManager.SetInitialBetFromCurrent();

    this.RefreshViews(true);

    return this.Forward();
  }

  OnStartMatchRequested() {
    EgtADebug('OnStartMatchRequested');
    if (Unless(this.CanStartMatch())) return this.Skip();

    EgtAInfo('OnStartMatchRequested -> IMatch');
    return this.Transit(IMatch);
  }

  OnResponsibleGamingWarning() {
    this.RuntimeGet(IResponsibleGaming).OpenResponsibleGamingWarning();

    return this.Forward();
  }

  OnInactivityTick(inactivityDuration: number) {
    if (this.Parent(ISystemManager).HasPendingExit()) return this.Skip();
    if (this.Parent(IGameManager).IsAutoPlayOn()) return this.Skip();

    const credit = this.RuntimeGetConst(IWallet).GetCredit();
    const minBet = this.Parent(IBetManager).GetMinBet();
    let shouldAutoExit = false;

    if (credit === 0) {
      const duration = this.RuntimeGetConst(IAttendance).GetDuration(AttendanceDurationType.NoCreditInIdle);
      if (duration !== null && inactivityDuration >= duration) {
        shouldAutoExit = true;
      }
    } else if (credit < minBet) {
      const duration = this.RuntimeGetConst(IAttendance).GetDuration(AttendanceDurationType.LessThanMinBetCreditInIdle);
      if (duration !== null && inactivityDuration >= duration) {
        shouldAutoExit = true;
      }
    }

    if (shouldAutoExit) {
      this.Parent(IGameManager).SetAutoPlay(false);
      this.Parent(ISystemManager).RequestPendingExit();
      this.RuntimeGet(IExitGameSwButtonView).SimulateButtonPress();
      return this.Consume();
    }

    return this.Skip();
  }

  OnZeroCreditAfterMatchTimeout() {
    if (this.Parent(ISystemManager).HasPendingExit()) return this.Skip();

    const credit = this.RuntimeGetConst(IWallet).GetCredit();
    if (Unless(credit === 0)) return this.Skip();

    this.Parent(IGameManager).SetAutoPlay(false);
    this.Parent(ISystemManager).RequestPendingExit();
    this.RuntimeGet(IExitGameSwButtonView).SimulateButtonPress();
    return this.Consume();
  }

  OnCashoutStart() {
    EgtAInfo('Cashout in progress');
    return this.Skip();
  }

  OnCashoutEnd(success: boolean) {
    if (Unless(success)) return this.Skip();

    EgtAInfo('Cashout is successful');
    this.RuntimeGet(IAppControl).ExitGracefully();

    // TODO: call RefreshViews() with disabled buttons

    return this.Consume();
  }

  OnCreditChanged(transactionInfo: TransactionInfo) {
    const limits = this.RuntimeGetConst(ILimits).GetBetLimits();
    const betManager = this.Parent(IBetManager);
    betManager.SetBetLimit(Math.min(transactionInfo.newCreditTotal, limits.maxBet));

    if (!this.CanStartMatch()) {
      this.Parent(IGameManager).SetAutoPlay(false);
    }

    this.RefreshViews();

    return this.Forward();
  }

  private RefreshViews(autoSelectInfoPage = false) {
    const blockGameInput = this.Parent(ISystemManager).HasPendingExit();
    const lastMatchWin = this.Parent(IGameManager).GetLastMatchWin();
    const matchOnLoss = lastMatchWin <= 0;
    this.Parent(IViewManager).SetupViews(RoundType.Main, {
      blockGameInput: blockGameInput,
      enableButtons: true,
      showSpinReelsCombinations: !matchOnLoss,
      autoSelectInfoPage: autoSelectInfoPage,
      overrideSpecialRoundView: RoundType.Main,
    });
  }

  GetMainRules() {
    return this.RuntimeGetConst(IMathRules).GetReelRoundRules(RoundType.Main);
  }

  private CanStartMatch() {
    const bet = this.ConstParent(IBetManager).GetCurrentBet();
    const credit = this.RuntimeGetConst(IWallet).GetCredit();

    if (bet > credit) return false;
    if (this.RuntimeGetConst(IResponsibleGaming).HasPendingResponsibleGamingWarning()) return false;

    return true;
  }

  private GetBetLimit() {
    const limits = this.RuntimeGetConst(ILimits).GetBetLimits();
    const credit = this.RuntimeGetConst(IWallet).GetCredit();
    return Math.min(credit, limits.maxBet);
  }
}

EgtALogCategoryClass(IdleState, 'IdleState');
