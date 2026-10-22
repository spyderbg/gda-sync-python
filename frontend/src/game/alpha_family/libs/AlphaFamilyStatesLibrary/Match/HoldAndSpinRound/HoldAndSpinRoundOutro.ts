// Egt::Game::AlphaFamily::HoldAndSpinRoundOutroState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundOutro):
// when the round's spins run out, the coins fly to the info screen and its outro plays; else the next spin.

import { State } from '@game/engine/Fsm/Fsm';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IHoldAndSpinRound, IHoldAndSpinRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IHoldAndSpinRoundInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { EReelsOverlayType, IReelsOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsOverlayView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';

const emptyInfos: SymbolViewInfos = [];

export class HoldAndSpinRoundOutroState extends State {
  static Interfaces = [IHoldAndSpinRoundOutro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true });

    const hsEnergy = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.HoldAndSpinEnergy);
    if (hsEnergy === 0) {
      const winFiguresInfo = this.GetWinFiguresInfo();
      this.RuntimeGet(IWinFiguresView).ShowComets(winFiguresInfo);
      this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowComets(winFiguresInfo);
    } else {
      const reelsOverlayView = this.RuntimeTryGet(IReelsOverlayView);
      if (reelsOverlayView) {
        reelsOverlayView.SetType(EReelsOverlayType.Main);
      }
      this.TransitLater(this.Parent(IMatch).ToNextRound());
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundInfoView.Events).cometsAnimDone, this.OnCometsFinished);
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundInfoView.Events).outroFinished, this.OnOutroFinished);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnFastStopRequested);
  }

  private GetWinFiguresInfo(): SymbolViewInfos {
    const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();
    const phases = lastResult.GetPhases(this.GetRuntime());
    if (!phases.length) return emptyInfos;

    const phase = phases[phases.length - 1];
    if (!(phase instanceof HoldAndSpinPhase)) return emptyInfos;

    return phase.winFiguresInfo;
  }

  private OnCometsFinished() {
    this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowOutro();

    return this.Consume();
  }

  private OnOutroFinished() {
    const reelsOverlayView = this.RuntimeTryGet(IReelsOverlayView);
    if (reelsOverlayView) {
      reelsOverlayView.SetType(EReelsOverlayType.Main);
    }
    this.TransitLater(this.Parent(IMatch).ToNextRound());
    return this.Forward();
  }

  private OnFastStopRequested() {
    this.RuntimeGet(IWinFiguresView).RequestFastForwardComets();
    this.RuntimeGet(IHoldAndSpinRoundInfoView).RequestFastForwardComets();

    return this.Consume();
  }
}

EgtALogCategoryClass(HoldAndSpinRoundOutroState, 'HoldAndSpinRoundOutroState');
