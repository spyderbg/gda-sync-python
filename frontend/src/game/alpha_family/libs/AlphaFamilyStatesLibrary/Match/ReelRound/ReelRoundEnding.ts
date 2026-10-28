// Egt::Game::AlphaFamily::ReelRoundEndingState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRoundEnding): ends the
// round with the gameflow, which adds its rewards to the match, and keeps its result for the reels between rounds.

import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndRoundRequest, type EndRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IReelRound, IReelRoundEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundEndingState extends State {
  static Interfaces = [IReelRoundEnding];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IReelRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const roundResult = this.ConstNvram(ReelRoundStorage).roundResult!;
    const rewards = roundResult.GetSummary().rewards;
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    const credits = available.Get(Currency.Credits) + rewards.Get(Currency.Credits);
    const coins = available.Get(Currency.CoinsSpinEnergy) + rewards.Get(Currency.CoinsSpinEnergy);
    this.Parent(IViewManager).SetupViews(roundResult, { enableButtons: false, overrideCoinsBar: coins, overrideWinBar: credits, disableInfoButton: true });

    if (!_isRecovery) {
      this.RequestEndRound();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
  }

  private RequestEndRound() {
    const request = new EndRoundRequest();
    this.RuntimeGet(IGameflow).RequestEndRound(request);
  }

  abstract ToRoundOutro(): Reaction;

  private StoreLastRoundResult() {
    // The last reel round result must be stored, to be displayed in the next idle state
    // TODO: find a better way to implement this
    const storage = this.Nvram(ReelRoundStorage);
    if (AssertIf(!storage.roundResult)) return;

    this.Parent(IGameManager).SetLastRoundResult(storage.roundResult!);
    storage.roundResult = null;
  }

  OnEndRoundReply(_reply: EndRoundReply) {
    this.StoreLastRoundResult();

    return this.ToRoundOutro();
  }
}

EgtALogCategoryClass(ReelRoundEndingState, 'ReelRoundEndingState');
