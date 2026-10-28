// Egt::Game::AlphaFamily::WheelRoundStartingState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundStarting): spins
// the wheel and asks the gameflow for the round's result.

import { State } from '@game/engine/Fsm/Fsm';
import { assert, AssertIf, AssertUnless } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { StartRoundRequest, type StartRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IWheelRound, IWheelRoundReeling, IWheelRoundStarting } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { IWheelRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { WheelRoundStorage } from './WheelRound.data';

export class WheelRoundStartingState extends State {
  static Interfaces = [IWheelRoundStarting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IWheelRound).SetupViews({ autoSelectInfoPage: _isRecovery });

    this.WheelsViewStartSpinning();

    if (!_isRecovery) {
      this.RequestStartRound();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).startRoundReply, this.OnStartRoundReply);
  }

  private WheelsViewStartSpinning() {
    // show reeling anim while waiting for reply
    this.RuntimeGet(IWheelRoundView).StartSpinning();
  }

  private RequestStartRound() {
    const storage = this.ConstNvram(WheelRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    const input = storage.roundInput!;

    const gameflow = this.RuntimeGetConst(IGameflow);
    if (AssertUnless(gameflow.HasMatchCurrenciesAvailable(input.consume))) return this.Reject();

    const mathRules = this.RuntimeGetConst(IMathRules);

    const minimumBet = mathRules.GetWheelRoundRules(RoundType.Wheel).GetMinimumCoinBet();
    if (AssertIf(minimumBet > gameflow.GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy))) return this.Reject();

    const request = new StartRoundRequest();
    request.roundInput = input;

    EgtATrace('RequestStartRound type={}', input.roundType);
    this.RuntimeGet(IGameflow).RequestStartRound(request);
    return this.Consume();
  }

  private OnStartRoundReply(reply: StartRoundReply) {
    const storage = this.Nvram(WheelRoundStorage);
    assert(storage.roundInput);
    assert(!storage.roundResult);

    storage.roundResult = reply.roundResult;

    return this.ToRoundReeling();
  }

  private ToRoundReeling() {
    return this.Transit(IWheelRoundReeling);
  }
}

EgtALogCategoryClass(WheelRoundStartingState, 'WheelRoundStartingState');
