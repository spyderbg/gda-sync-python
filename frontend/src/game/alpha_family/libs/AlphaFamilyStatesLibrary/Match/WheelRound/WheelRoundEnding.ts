// Egt::Game::AlphaFamily::WheelRoundEndingState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundEnding): ends the
// round with the gameflow.

import { State } from '@game/engine/Fsm/Fsm';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndRoundRequest, type EndRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IWheelRound, IWheelRoundEnding, IWheelRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { WheelRoundStorage } from './WheelRound.data';

export class WheelRoundEndingState extends State {
  static Interfaces = [IWheelRoundEnding];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const startSector = this.ConstNvram(WheelRoundStorage).wheelStopSector;
    const result = this.ConstNvram(WheelRoundStorage).roundResult!;
    const rewards = result.GetSummary(this.GetRuntime()).rewards;
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    const credits = available.Get(Currency.Credits) + rewards.Get(Currency.Credits);
    const coins = available.Get(Currency.CoinsSpinEnergy) + rewards.Get(Currency.CoinsSpinEnergy); // expected 0
    this.Parent(IWheelRound).SetupViews({
      autoSelectInfoPage: _isRecovery,
      overrideStartSector: startSector,
      overrideCoinsBar: coins,
      overrideWinBar: credits,
    });

    if (!_isRecovery) {
      this.RequestEndRound();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
  }

  private RequestEndRound() {
    const request = new EndRoundRequest();
    this.RuntimeGet(IGameflow).RequestEndRound(request);
  }

  private OnEndRoundReply(_reply: EndRoundReply) {
    const storage = this.Nvram(WheelRoundStorage);
    assert(storage.roundResult);

    storage.roundResult = null;

    return this.ToRoundOutro();
  }

  private ToRoundOutro() {
    return this.Transit(IWheelRoundOutro);
  }
}

EgtALogCategoryClass(WheelRoundEndingState, 'WheelRoundEndingState');
