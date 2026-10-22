// Egt::Game::AlphaFamily::WheelRoundReelingState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRoundReeling): stops
// the wheel at the round's sector.

import { State } from '@game/engine/Fsm/Fsm';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { WheelRoundPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundPhase.data';
import { IWheelRound, IWheelRoundPresenting, IWheelRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { IWheelRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { WheelRoundStorage } from './WheelRound.data';

export class WheelRoundReelingState extends State {
  static Interfaces = [IWheelRoundReeling];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Parent(IWheelRound).SetupViews({ enableButtons: false, autoSelectInfoPage: _isRecovery });

    this.RuntimeGet(IWheelRoundView).StartSpinning();
    this.RuntimeGet(IWheelRoundView).StopSpinning(this.GetStopSector());
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IWheelRoundView.Events).spinningFinished, this.OnSpinFinished);
  }

  private OnSpinFinished() {
    const nvram = this.Nvram(WheelRoundStorage);
    nvram.wheelStopSector = this.GetStopSector();

    return this.Transit(IWheelRoundPresenting);
  }

  private GetStopSector() {
    const storage = this.ConstNvram(WheelRoundStorage);
    assert(storage.roundResult);

    const phases = storage.roundResult!.GetPhases(this.GetRuntime());
    const phase = phases[phases.length - 1];
    assert(phase instanceof WheelRoundPhase);

    const wheelPhase = phase as WheelRoundPhase;
    return wheelPhase.stopSector;
  }
}

EgtALogCategoryClass(WheelRoundReelingState, 'WheelRoundReelingState');
