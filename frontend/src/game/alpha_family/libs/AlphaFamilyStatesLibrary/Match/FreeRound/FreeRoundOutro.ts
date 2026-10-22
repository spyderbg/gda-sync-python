// Egt::Game::AlphaFamily::FreeRoundOutroState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRoundOutro): the free
// spins' outro splash, unless a hold and spin or wheel round follows.

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IFreeRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IFreeRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundOverlayView.bridge';
import { ReelRoundOutroState } from '../ReelRound/ReelRoundOutro';

export class FreeRoundOutroState extends ReelRoundOutroState {
  static Interfaces = [IFreeRoundOutro, ...ReelRoundOutroState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);

    this.AttachCallbacks();

    if (this.HasOutro()) {
      this.Parent(IViewManager).SetupViews(RoundType.Free, {});

      const gameflow = this.RuntimeGetConst(IGameflow);
      const rewarded = Math.max(
        gameflow.GetConsecutiveRoundAvailable(Currency.ExtraSpinEnergy),
        gameflow.GetConsecutiveRoundAvailable(Currency.CoinsSpinEnergy),
      );

      const freeRoundOverlay = this.RuntimeGet(IFreeRoundOverlayView);
      freeRoundOverlay.SetRewardedAmount(rewarded);
      freeRoundOverlay.ShowOutro();
    } else {
      this.TransitLater(this.OnOutroFinished()); // no transition to hold and spin
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IFreeRoundOverlayView.Events).outroMidway, this.OnOutroMidway);
    this.ReactOn(this.RuntimeGetConst(IFreeRoundOverlayView.Events).outroFinished, this.OnOutroFinished);
  }

  private HasOutro() {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const nextRound = gameflow.GetNextRoundType();

    return nextRound !== RoundType.HoldAndSpin && nextRound !== RoundType.Wheel;
  }

  private OnOutroMidway() {
    const nextRoundType = this.RuntimeGetConst(IGameflow).GetNextRoundType();

    this.Parent(IViewManager).SetupViews(nextRoundType, { setupOverlay: false });

    return this.Forward();
  }

  private OnOutroFinished() {
    return this.Parent(IMatch).ToNextRound();
  }
}

EgtALogCategoryClass(FreeRoundOutroState, 'FreeRoundOutroState');
