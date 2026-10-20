// Egt::Game::AlphaFamily::MatchEndOutroState (AlphaFamilyStatesLibrary/Match/MatchEndOutro): counts the match's win
// from the win bar into the credit bar, then returns to idle.

import { State } from '../../../../../engine/Fsm/Fsm';
import { IWallet, type TransactionInfo } from '../../../../../engine/Game/RuntimeImport/IWallet';
import { RoundType } from '../../../AlphaFamily/Math/Common/Common.data';
import { GameManagerNvrams, IGameManager } from '../../../AlphaFamily/States/IGameManager';
import { IViewManager } from '../../../AlphaFamily/States/IViewManager';
import { IIdle } from '../../../AlphaFamily/States/Idle/IIdle';
import { IMatchEndOutro } from '../../../AlphaFamily/States/Match/IMatchEndOutro';
import { EWinBarState, ICreditBarView, ICreditsWinBarView } from '../../../AlphaFamily/Views/BarsView.bridge';
import { BarsSync } from '../../../AlphaFamily/Views/Tools/BarsSync';

export class MatchEndOutroState extends State {
  static Interfaces = [IMatchEndOutro];

  OnTransit() {
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCreditChanged, this.OnCreditChanged);
    this.ReactOn(this.RuntimeGetConst(ICreditBarView.Events).animatingDone, this.OnAccumulationEnd);
    const lastMatchWin = this.Parent(IGameManager).GetLastMatchWin();
    const prevCredits = this.RuntimeGet(IWallet).GetCredit() - lastMatchWin;
    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: lastMatchWin > 0, overrideCredits: prevCredits });
    if (lastMatchWin > 0) this.StartTakeWinTransfer(this.Parent(IGameManager).IsAutoPlayOn() || this.Nvram(GameManagerNvrams).taxedWin);
    else this.TransitLater(IIdle);
  }

  OnAccumulationEnd(_value: number) {
    return this.Transit(IIdle);
  }

  OnCreditChanged(_info: TransactionInfo) {
    return this.Reject(); // consume the event - this state will show animated win
  }

  private StartTakeWinTransfer(oneStepTakeWin: boolean) {
    const lastMatchWin = this.Parent(IGameManager).GetLastMatchWin();
    const prevCredits = this.RuntimeGet(IWallet).GetCredit() - lastMatchWin;
    const winBar = this.RuntimeGet(ICreditsWinBarView);
    const creditBar = this.RuntimeGet(ICreditBarView);
    winBar.SetLabelState(EWinBarState.Win);
    const acc = BarsSync.CalculateTakeWinAcc({
      currentWin: lastMatchWin, currentCredit: prevCredits, isAutoplayOn: this.Parent(IGameManager).IsAutoPlayOn(), oneStepTakeWin,
      targetWin: oneStepTakeWin ? lastMatchWin : 0,
    });
    if (acc.winAcc) winBar.SetAccumulation(acc.winAcc);
    if (acc.creditAcc) creditBar.SetAccumulation(acc.creditAcc);
  }
}
