// Egt::Game::AlphaFamily::WheelRoundPresentingState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundPresenting):
// presents the sector's win, then counts it on the win bar.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { IWheelRound, IWheelRoundEnding, IWheelRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { ICoinsBarView, ICoinsWinBarView, ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IWheelRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { WheelRoundStorage } from './WheelRound.data';

export class WheelRoundPresentingState extends State {
  static Interfaces = [IWheelRoundPresenting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const startSector = this.ConstNvram(WheelRoundStorage).wheelStopSector;
    this.Parent(IWheelRound).SetupViews({ autoSelectInfoPage: _isRecovery, overrideStartSector: startSector });

    this.RuntimeGet(IWheelRoundView).StartPresentingWin();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWheelRoundView.Events).winPresentingFinished, this.OnWheelWinPresentingFinished);
    this.ReactOn(this.RuntimeGetConst(ICreditsWinBarView.Events).animatingDone, this.OnAccumulationEnd);
  }

  private OnWheelWinPresentingFinished() {
    const result = this.ConstNvram(WheelRoundStorage).roundResult!;
    const summary = result.GetSummary(this.GetRuntime());

    this.RuntimeGet(ICreditsWinBarView).AddWinResultFast(summary);
    const coinsWinBar = this.RuntimeTryGet(ICoinsWinBarView);
    if (coinsWinBar) {
      coinsWinBar.AddWinResult(summary);
    }
    this.RuntimeGet(ICoinsBarView).SetValue(0);

    return this.Consume();
  }

  private OnAccumulationEnd(_value: number) {
    return this.Transit(IWheelRoundEnding);
  }
}

EgtALogCategoryClass(WheelRoundPresentingState, 'WheelRoundPresentingState');
