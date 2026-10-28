// Egt::Game::AlphaFamily::GambleRoundEndingState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundEnding): ends
// the round with the gameflow, then gambles again while there are gamble tokens and credits.

import { State } from '@game/engine/Fsm/Fsm';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndRoundRequest, type EndRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import {
  IGambleRound, IGambleRoundEnding, IGambleRoundIntro, IGambleRoundOutro,
} from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { GambleRoundStorage } from './GambleRound.data';

export class GambleRoundEndingState extends State {
  static Interfaces = [IGambleRoundEnding];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const roundResult = this.ConstNvram(GambleRoundStorage).roundResult!;
    const rewarded = roundResult.GetSummary(this.GetRuntime()).rewards.Get(Currency.Credits);
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);
    this.Parent(IGambleRound).SetupViews(
      { enableInput: false, overrideWinBar: available + rewarded, autoSelectInfoPage: isRecovery });

    if (!isRecovery) {
      this.RequestEndRound();
    }
  }

  ToRoundOutro() {
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    if (available.Get(Currency.GambleToken) > 0 && available.Get(Currency.Credits) > 0) {
      return this.Transit(IGambleRoundIntro);
    } else {
      return this.Transit(IGambleRoundOutro);
    }
  }

  // Kernel event handlers
  OnEndRoundReply(_reply: EndRoundReply) {
    const storage = this.Nvram(GambleRoundStorage);
    assert(storage.roundResult);

    storage.roundResult = null;

    return this.ToRoundOutro();
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
  }

  private RequestEndRound() {
    const request = new EndRoundRequest();
    this.RuntimeGet(IGameflow).RequestEndRound(request);
  }
}

EgtALogCategoryClass(GambleRoundEndingState, 'GambleRoundEndingState');
