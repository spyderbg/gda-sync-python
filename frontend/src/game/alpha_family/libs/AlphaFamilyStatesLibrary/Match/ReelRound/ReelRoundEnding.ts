// Egt::Game::AlphaFamily::ReelRoundEndingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundEnding): ends the
// round with the gameflow, which adds its rewards to the match, and keeps its result for the reels between rounds.

import { Reaction, State } from '../../../../../engine/Fsm/Fsm';
import { Currency } from '../../../AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '../../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '../../../AlphaFamily/States/IGameManager';
import { IViewManager } from '../../../AlphaFamily/States/IViewManager';
import { ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundEndingState extends State {
  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    const rewards = roundResult.GetSummary().rewards;
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    this.Parent(IViewManager).SetupViews(roundResult, {
      enableButtons: false,
      overrideCoinsBar: available.Get(Currency.CoinsSpinEnergy) + rewards.Get(Currency.CoinsSpinEnergy),
      overrideWinBar: available.Get(Currency.Credits) + rewards.Get(Currency.Credits),
    });
    if (!isRecovery) this.RuntimeGet(IGameflow).RequestEndRound({});
  }

  protected abstract ToRoundOutro(): Reaction;

  private StoreLastRoundResult() {
    // The last reel round result must be stored, to be displayed in the next idle state
    const storage = this.Nvram(ReelRoundStorage);
    if (!storage.roundResult) return;
    this.Parent(IGameManager).SetLastRoundResult(storage.roundResult);
    storage.roundResult = null;
  }

  OnEndRoundReply() {
    this.StoreLastRoundResult();
    return this.ToRoundOutro();
  }
}
