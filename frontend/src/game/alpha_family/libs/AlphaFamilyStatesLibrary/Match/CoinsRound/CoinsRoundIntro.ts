// Egt::Game::AlphaFamily::CoinsRoundIntroState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundIntro): the
// coins round's intro splash.

import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICoinsRoundInput, ICoinsRoundIntro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { ICoinsRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/ICoinsRoundOverlayView.bridge';
import { ReelRoundIntroState } from '../ReelRound/ReelRoundIntro';

export class CoinsRoundIntroState extends ReelRoundIntroState {
  static Interfaces = [ICoinsRoundIntro, ...ReelRoundIntroState.Interfaces];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    super.OnTransit(isStartup, isRecovery);

    this.AttachCallbacks();

    this.Parent(IViewManager).SetupViews(RoundType.Coins, { overrideSpecialRoundView: RoundType.Coins });

    this.RuntimeGet(ICoinsRoundOverlayView).ShowIntro();
  }

  ToRoundInput() {
    return this.Transit(ICoinsRoundInput);
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(ICoinsRoundOverlayView.Events).introMidway, this.OnIntroMidway);
    this.ReactOn(this.RuntimeGetConst(ICoinsRoundOverlayView.Events).introFinished, this.OnIntroFinished);
  }

  private OnIntroMidway() {
    return this.Skip();
  }

  private OnIntroFinished() {
    return this.ToRoundInput();
  }
}

EgtALogCategoryClass(CoinsRoundIntroState, 'CoinsRoundIntroState');
