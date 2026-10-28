// Egt::Game::AlphaFamily::GambleRoundPresentingState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundPresenting):
// shows the house's card, and whether it won.

import { State } from '@game/engine/Fsm/Fsm';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGambleRound, IGambleRoundEnding, IGambleRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IGambleRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import { GambleRoundStorage } from './GambleRound.data';

export class GambleRoundPresentingState extends State {
  static Interfaces = [IGambleRoundPresenting];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    const roundResult = this.ConstNvram(GambleRoundStorage).roundResult!;
    const rewarded = roundResult.GetSummary(this.GetRuntime()).rewards.Get(Currency.Credits);
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits); // expected 0
    this.Parent(IGambleRound).SetupViews(
      { enableInput: false, overrideWinBar: available + rewarded, autoSelectInfoPage: isRecovery });

    const nvram = this.ConstNvram(GambleRoundStorage);
    assert(nvram.houseCard !== null);
    const houseCard = nvram.houseCard!;
    const isWin = rewarded > 0;
    this.RuntimeGet(IGambleRoundView).ShowResult(isWin, houseCard);
  }

  private AttachCallbacks() {
    this.ReactOn(
      this.RuntimeGetConst(IGambleRoundView.Events).showResultFinished, // winPresentingFinished,
      this.OnGambleWinPresentingFinished);
  }

  private OnGambleWinPresentingFinished() {
    return this.Transit(IGambleRoundEnding);
  }
}

EgtALogCategoryClass(GambleRoundPresentingState, 'GambleRoundPresentingState');
