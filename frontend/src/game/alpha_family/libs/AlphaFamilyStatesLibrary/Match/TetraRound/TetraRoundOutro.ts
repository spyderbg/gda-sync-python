// Egt::Game::AlphaFamily::TetraRoundOutroState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundOutro): the
// "Tetra completed" splash, which switches back to the main views midway; then the match's win is taken.

import { State } from '@game/engine/Fsm/Fsm';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { ITetraRound, ITetraRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { ITetraSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { EBackgroundType, EKnobsType, IGameBackgroundView, IKnobsView, ITetraRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { ITetraRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import {
  ELanguageSwButtonType, ESoundSwButtonType, IExitTetraSwButtonView, ILanguageSwButtonView, ISoundVolumeSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class TetraRoundOutroState extends State {
  static Interfaces = [ITetraRoundOutro];

  OnTransit() {
    this.ReactOn(this.RuntimeGetConst(ITetraRoundOverlayView.Events).outroMidway, this.OnOutroMidway);
    this.ReactOn(this.RuntimeGetConst(ITetraRoundOverlayView.Events).outroFinished, this.OnOutroFinished);
    this.Parent(ITetraRound).SetupViews({});
    this.RuntimeGet(ITetraRoundOverlayView).ShowOutro();
  }

  private UpdateBet() {
    const initialBet = this.RuntimeGetConst(IGameflow).GetInitialCreditsBet();
    this.Parent(IBetManager).SetCurrentBet(initialBet);
    this.Parent(IBetManager).SetInitialBetFromCurrent();
  }

  OnOutroMidway() {
    this.UpdateBet();
    this.RuntimeGet(IKnobsView).SetKnobsType(EKnobsType.Normal);
    this.RuntimeGet(IGameBackgroundView).SetBackgroundType(EBackgroundType.Main);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetButtonType(ESoundSwButtonType.Normal);
    this.RuntimeGet(ILanguageSwButtonView).SetButtonType(ELanguageSwButtonType.Normal);
    this.RuntimeGet(ITetraRoundView).SetVisible(false);
    this.RuntimeGet(IReelsView).SetVisible(true);
    // tetra sw buttons
    const collectTetraButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    collectTetraButton?.SetEnabled(false);
    collectTetraButton?.SetVisible(false);
    const tetraSpinBarView = this.RuntimeTryGet(ITetraSpinBarView);
    tetraSpinBarView?.SetVisible(false);
    tetraSpinBarView?.ClearCounter();
    // restore the initial reels
    const matchOnLoss = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits) <= 0;
    this.Parent(IViewManager).SetupViews(RoundType.Main, { showSpinReelsCombinations: !matchOnLoss, setupOverlay: false, playAnimationFromLoop: true });
    return this.Forward();
  }

  OnOutroFinished() {
    return this.Parent(IMatch).ToTakeWin();
  }
}
