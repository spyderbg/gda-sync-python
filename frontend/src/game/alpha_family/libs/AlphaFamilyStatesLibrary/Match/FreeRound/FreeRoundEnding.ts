// Egt::Game::AlphaFamily::FreeRoundEndingState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundEnding): shows the
// retrigger screen when the round won more free spins, then the next free spin or the outro.

import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IFreeRoundEnding, IFreeRoundOutro, IFreeRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { IFreeRoundRetriggerView } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundRetriggerView.bridge';
import { ReelRoundEndingState } from '../ReelRound/ReelRoundEnding';

export class FreeRoundEndingState extends ReelRoundEndingState {
  static Interfaces = [IFreeRoundEnding, ...ReelRoundEndingState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);

    this.AttachOwnCallbacks();
  }

  ToRoundOutro() {
    const freeRoundsCount = this.GetFreeRoundsRewarded();

    if (freeRoundsCount > 0) {
      this.RuntimeGet(IFreeRoundRetriggerView).ShowRetriggerScreen(freeRoundsCount);
      return this.Consume();
    }

    return this.ToNextRound();
  }

  /** @cppName AttachCallbacks */
  private AttachOwnCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IFreeRoundRetriggerView.Events).retriggerFinished, this.OnRetriggerFinished);
  }

  private GetFreeRoundsRewarded() {
    const result = this.ConstParent(IGameManager).GetLastRoundResult();
    const rewards = result.GetSummary(this.GetRuntime()).rewards;

    const rewarded = rewards.Get(Currency.FreeSpinEnergy);
    const currentBet = this.ConstParent(IBetManager).GetCurrentBet();
    if (AssertIf(currentBet === 0)) return 0;

    return Math.trunc(rewarded / currentBet);
  }

  private OnRetriggerFinished() {
    return this.ToNextRound();
  }

  private ToNextRound() {
    if (this.RuntimeGetConst(IGameflow).GetNextRoundType() === RoundType.Free) {
      return this.Transit(IFreeRoundStarting);
    } else {
      return this.Transit(IFreeRoundOutro);
    }
  }
}

EgtALogCategoryClass(FreeRoundEndingState, 'FreeRoundEndingState');
