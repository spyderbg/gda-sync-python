// Egt::Game::AlphaFamily::HoldAndSpinRoundEndingState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundEnding):
// ends the round with the gameflow; the free spins it won are shown on the retrigger screen.

import { State } from '@game/engine/Fsm/Fsm';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndRoundRequest, type EndRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IHoldAndSpinRound, IHoldAndSpinRoundEnding, IHoldAndSpinRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IFreeRoundRetriggerView } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundRetriggerView.bridge';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

export class HoldAndSpinRoundEndingState extends State {
  static Interfaces = [IHoldAndSpinRoundEnding];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true, showMainInfo: true });

    if (!_isRecovery) {
      this.RequestEndRound();
    }
  }

  ToRoundOutro() {
    const freeRoundsCount = this.GetFreeRoundsRewarded();
    if (freeRoundsCount > 0) {
      this.RuntimeGet(IFreeRoundRetriggerView).ShowRetriggerScreen(freeRoundsCount);
      return this.Consume();
    }
    return this.ToNextRound();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
    this.ReactOn(this.RuntimeGetConst(IFreeRoundRetriggerView.Events).retriggerFinished, this.OnRetriggerFinished);
  }

  private RequestEndRound() {
    const request = new EndRoundRequest();
    this.RuntimeGet(IGameflow).RequestEndRound(request);
  }

  OnEndRoundReply(_reply: EndRoundReply) {
    this.StoreLastRoundResult();
    return this.ToRoundOutro();
  }

  private StoreLastRoundResult() {
    const storage = this.Nvram(HoldAndSpinRoundStorage);
    if (AssertIf(!storage.roundResult)) return;

    this.Parent(IGameManager).SetLastRoundResult(storage.roundResult!);
    storage.roundResult = null;
  }

  private GetFreeRoundsRewarded() {
    const result = this.ConstParent(IGameManager).GetLastRoundResult();
    const rewards = result.GetSummary(this.GetRuntime()).rewards;

    const currentBet = this.ConstParent(IBetManager).GetCurrentBet();
    if (AssertIf(currentBet === 0)) return 0;

    const previousRoundType = this.RuntimeGetConst(IGameflow).GetConsecutiveTriggerRoundType();
    let rewarded = 0;
    switch (previousRoundType) {
      case RoundType.Free: rewarded = rewards.Get(Currency.FreeSpinEnergy); break;
      case RoundType.CoinsFree: rewarded = rewards.Get(Currency.CoinsFreeSpinEnergy); break;
      case RoundType.ExtraFree: rewarded = rewards.Get(Currency.ExtraFreeSpinEnergy); break;
      default: break;
    }

    return Math.trunc(rewarded / currentBet);
  }

  private OnRetriggerFinished() {
    return this.ToNextRound();
  }

  private ToNextRound() {
    return this.Transit(IHoldAndSpinRoundOutro);
  }
}

EgtALogCategoryClass(HoldAndSpinRoundEndingState, 'HoldAndSpinRoundEndingState');
