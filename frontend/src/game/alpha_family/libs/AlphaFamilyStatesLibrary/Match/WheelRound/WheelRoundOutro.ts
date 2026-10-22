// Egt::Game::AlphaFamily::WheelRoundOutroState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundOutro): the
// wheel's outro, which hides the wheel midway.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IWheelRound, IWheelRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { IWheelRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundOverlayView.bridge';
import { IWheelRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { WheelRoundStorage } from './WheelRound.data';

export class WheelRoundOutroState extends State {
  static Interfaces = [IWheelRoundOutro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const startSector = this.ConstNvram(WheelRoundStorage).wheelStopSector;
    this.Parent(IWheelRound).SetupViews({ overrideStartSector: startSector });

    this.RuntimeGet(IWheelRoundOverlayView).StartOutro();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWheelRoundOverlayView.Events).outroMidway, this.OnOutroMidway);
    this.ReactOn(this.RuntimeGetConst(IWheelRoundOverlayView.Events).outroFinished, this.OnOutroFinished);
  }

  private OnOutroFinished() {
    return this.Parent(IMatch).ToNextRound();
  }

  private OnOutroMidway() {
    const nextRoundType = this.RuntimeGetConst(IGameflow).GetNextRoundType();

    this.Parent(IViewManager).SetupViews(nextRoundType, { setupOverlay: false, autoSelectInfoPage: true });

    this.RuntimeGet(IWheelRoundView).SetVisible(false);

    return this.Forward();
  }
}

EgtALogCategoryClass(WheelRoundOutroState, 'WheelRoundOutroState');
