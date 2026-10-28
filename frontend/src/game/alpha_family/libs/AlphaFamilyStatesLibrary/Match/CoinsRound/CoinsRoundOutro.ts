// Egt::Game::AlphaFamily::CoinsRoundOutroState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundOutro): the coins
// round's outro splash.

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICoinsRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { ICoinsRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/ICoinsRoundOverlayView.bridge';
import { ReelRoundOutroState } from '../ReelRound/ReelRoundOutro';

export class CoinsRoundOutroState extends ReelRoundOutroState {
  static Interfaces = [ICoinsRoundOutro, ...ReelRoundOutroState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);

    this.AttachCallbacks();

    this.Parent(IViewManager).SetupViews(RoundType.Coins, {});

    this.RuntimeGet(ICoinsRoundOverlayView).ShowOutro();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(ICoinsRoundOverlayView.Events).outroMidway, this.OnOutroMidway);
    this.ReactOn(this.RuntimeGetConst(ICoinsRoundOverlayView.Events).outroFinished, this.OnOutroFinished);
  }

  private OnOutroMidway() {
    return this.Skip();
  }

  private OnOutroFinished() {
    return this.Parent(IMatch).ToNextRound();
  }
}

EgtALogCategoryClass(CoinsRoundOutroState, 'CoinsRoundOutroState');
