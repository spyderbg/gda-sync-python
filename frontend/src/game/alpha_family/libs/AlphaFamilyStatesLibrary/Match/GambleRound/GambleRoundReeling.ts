// Egt::Game::AlphaFamily::GambleRoundReelingState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRoundReeling): keeps
// the house's card, the result's stop sector.

import { State } from '@game/engine/Fsm/Fsm';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import type { int } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { WheelRoundPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundPhase.data';
import { IGambleRound, IGambleRoundPresenting, IGambleRoundReeling } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IGambleRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import { GambleRoundStorage } from './GambleRound.data';

export class GambleRoundReelingState extends State {
  static Interfaces = [IGambleRoundReeling];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.Parent(IGambleRound).SetupViews({});
    this.RuntimeGet(IGambleRoundView).ShowIdle();
    this.TransitLater(this.OnSpinFinished());
  }

  private GetHouseCard(): int {
    const storage = this.ConstNvram(GambleRoundStorage);
    assert(storage.roundResult);

    const phase = storage.roundResult!.GetPhases(this.GetRuntime()).at(-1)!;
    assert(phase instanceof WheelRoundPhase);

    const gamblePhase = phase as WheelRoundPhase;
    return gamblePhase.stopSector;
  }

  private OnSpinFinished() {
    const nvram = this.Nvram(GambleRoundStorage);
    nvram.houseCard = this.GetHouseCard();

    return this.Transit(IGambleRoundPresenting);
  }
}

EgtALogCategoryClass(GambleRoundReelingState, 'GambleRoundReelingState');
