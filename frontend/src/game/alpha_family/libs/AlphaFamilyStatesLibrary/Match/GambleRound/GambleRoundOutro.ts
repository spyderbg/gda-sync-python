// Egt::Game::AlphaFamily::GambleRoundOutroState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundOutro): shows
// the last card, then the reels again midway, and takes the win.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IGambleRound, IGambleRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IGambleRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundOverlayView.bridge';
import { IGambleRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import { IGambleBlackSwButtonView, IGambleRedSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { GambleRoundStorage } from './GambleRound.data';

export class GambleRoundOutroState extends State {
  static Interfaces = [IGambleRoundOutro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');
    this.AttachCallbacks();

    this.Parent(IGambleRound).SetupViews({});

    const storage = this.ConstNvram(GambleRoundStorage);
    if (storage.houseCard !== null) {
      const houseCard = storage.houseCard!;

      const gameflow = this.RuntimeGetConst(IGameflow);
      const rewarded = gameflow.GetMatchCurrencyAvailable(Currency.Credits);

      const isWin: boolean = rewarded > 0;
      this.RuntimeGet(IGambleRoundView).ShowOutro(isWin, houseCard);
    }
    // else - the game was CANCEL-ed
    this.RuntimeGet(IGambleRoundOverlayView).StartOutro();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGambleRoundOverlayView.Events).outroMidway, this.OnOutroMidway);
    this.ReactOn(this.RuntimeGetConst(IGambleRoundOverlayView.Events).outroFinished, this.OnOutroFinished);
  }

  private OnOutroFinished() {
    return this.Parent(IMatch).ToTakeWin();
  }

  private OnOutroMidway() {
    const nextRoundType = this.RuntimeGetConst(IGameflow).GetNextRoundType();
    const matchCreditsAvailable = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);
    const matchOnLoss = matchCreditsAvailable <= 0;

    this.RuntimeGet(IGambleRoundView).SetVisible(false);

    this.RuntimeGet(IGambleRedSwButtonView).SetVisible(false);
    this.RuntimeGet(IGambleBlackSwButtonView).SetVisible(false);

    this.Parent(IViewManager).SetupViews(
      nextRoundType,
      {
        showSpinReelsCombinations: !matchOnLoss,
        setupOverlay: false,
        autoSelectInfoPage: true,
        playAnimationFromLoop: true,
        showGambleCompletedStatus: true,
      });

    return this.Forward();
  }
}

EgtALogCategoryClass(GambleRoundOutroState, 'GambleRoundOutroState');
