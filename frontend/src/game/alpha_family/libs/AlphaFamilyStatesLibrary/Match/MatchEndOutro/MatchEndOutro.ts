// Egt::Game::AlphaFamily::MatchEndOutroState (AlphaFamilyStatesLibrary/Match/MatchEndOutro): counts the match's win
// from the win bar into the credit bar, then returns to idle.

import { State } from '@game/engine/Fsm/Fsm';
import { IWallet, type TransactionInfo } from '@game/engine/Game/RuntimeImport/IWallet';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { GameManagerNvrams, IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IIdle } from '@game/alpha_family/libs/AlphaFamily/States/Idle/IIdle';
import { IMatchEndOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEndOutro';
import { EWinBarState, ICreditBarView, ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { BarSyncTakeWinInput, BarsSync } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/BarsSync';

export class MatchEndOutroState extends State {
  static Interfaces = [IMatchEndOutro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const lastMatchWin = this.Parent(IGameManager).GetLastMatchWin();
    const prevCredits = this.RuntimeGet(IWallet).GetCredit() - lastMatchWin;
    const matchOnLoss = lastMatchWin <= 0;
    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: !matchOnLoss, overrideCredits: prevCredits });

    if (lastMatchWin > 0) {
      if (this.Parent(IGameManager).IsAutoPlayOn() || this.Nvram(GameManagerNvrams).taxedWin) {
        this.StartInstantAccumulationAnim();
      } else {
        this.StartAccumulationAnim();
      }
    } else {
      this.TransitLater(IIdle);
    }
  }

  OnAccumulationEnd(_value: number) {
    return this.Transit(IIdle);
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCreditChanged, this.OnCreditChanged);
    this.ReactOn(this.RuntimeGetConst(ICreditBarView.Events).animatingDone, this.OnAccumulationEnd);
  }

  private OnCreditChanged(_transactionInfo: TransactionInfo) {
    return this.Reject(); // consume the event - this state will show animated win
  }

  private StartAccumulationAnim() {
    this.StartTakeWinTransfer(false);
  }

  private StartInstantAccumulationAnim() {
    this.StartTakeWinTransfer(true);
  }

  private StartTakeWinTransfer(oneStepTakeWin: boolean) {
    const lastMatchWin = this.Parent(IGameManager).GetLastMatchWin();
    const prevCredits = this.RuntimeGet(IWallet).GetCredit() - lastMatchWin;

    const winBar = this.RuntimeGet(ICreditsWinBarView);
    const creditBar = this.RuntimeGet(ICreditBarView);

    // creditBar.Maximize(true);
    winBar.SetLabelState(EWinBarState.Win);

    const ctx = new BarSyncTakeWinInput();
    ctx.currentWin = lastMatchWin;
    ctx.currentCredit = prevCredits;
    ctx.isAutoplayOn = this.Parent(IGameManager).IsAutoPlayOn();
    ctx.oneStepTakeWin = oneStepTakeWin;

    if (oneStepTakeWin) {
      ctx.targetWin = lastMatchWin;
    }

    const acc = BarsSync.CalculateTakeWinAcc(ctx);

    if (acc.winAcc !== undefined) {
      winBar.SetAccumulation(acc.winAcc);
    }
    if (acc.creditAcc !== undefined) {
      creditBar.SetAccumulation(acc.creditAcc);
    }
  }
}

EgtALogCategoryClass(MatchEndOutroState, 'MatchEndOutroState');
