// Egt::Game::AlphaFamily::FreeRoundIntroState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundIntro): the free
// spins' intro splash, unless the free spins follow a hold and spin round of the same free round.

import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IFreeRoundIntro, IFreeRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { IReelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { IFreeRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundOverlayView.bridge';
import { ReelRoundIntroState } from '../ReelRound/ReelRoundIntro';

export class FreeRoundIntroState extends ReelRoundIntroState {
  static Interfaces = [IFreeRoundIntro, ...ReelRoundIntroState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);

    this.AttachCallbacks();

    if (this.HasIntro()) {
      this.Parent(IViewManager).SetupViewsLastResult({});

      this.RuntimeGet(IFreeRoundOverlayView).SetFreeSpinsRewarded(this.GetFreeSpinRewarded());
      this.RuntimeGet(IFreeRoundOverlayView).ShowIntro();
    } else {
      this.TransitLater(this.ToRoundInput());
    }
  }

  ToRoundInput() {
    // Free round has no Input => jump to starting
    return this.Transit(IFreeRoundStarting);
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IFreeRoundOverlayView.Events).introMidway, this.OnIntroMidway);
    this.ReactOn(this.RuntimeGetConst(IFreeRoundOverlayView.Events).introFinished, this.OnIntroFinished);
  }

  private HasIntro() {
    const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();

    // no transition from hold and spin triggered by same round
    return lastResult.GetTriggerRoundType() !== this.ConstParent(IReelRound).GetRoundType();
  }

  private GetFreeSpinRewarded() {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const rewarded = Math.max(
      gameflow.GetConsecutiveRoundAvailable(Currency.FreeSpinEnergy),
      gameflow.GetConsecutiveRoundAvailable(Currency.CoinsFreeSpinEnergy),
    );
    const bet = this.ConstParent(IGameManager).GetLastRoundResult().GetBet();
    if (AssertIf(bet === 0)) return rewarded;

    return Math.trunc(rewarded / bet);
  }

  private OnIntroMidway() {
    const gameManager = this.Parent(IGameManager);
    const zeroRewardRound = gameManager.FindRandomZeroRewardRound(RoundType.Free);

    if (zeroRewardRound) {
      gameManager.SetLastRoundResult(zeroRewardRound);
    }

    this.Parent(IViewManager).SetupViews(RoundType.Free, { setupOverlay: false });

    return this.Forward();
  }

  private OnIntroFinished() {
    return this.ToRoundInput();
  }
}

EgtALogCategoryClass(FreeRoundIntroState, 'FreeRoundIntroState');
