// Egt::Game::AlphaFamily::FreeRoundRetriggerView (NordicRushView/Views/FreeRoundRetriggerView.h/.cpp): shows nothing;
// the hold and spin round's outro shows the free spins won again ("+N", HoldAndSpinRoundOverlayView).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless } from '@game/engine/GameCore/Common/Defensive';
import { IFreeRoundRetriggerView, IFreeRoundRetriggerViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundRetriggerView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

export class FreeRoundRetriggerView extends BaseView implements IFreeRoundRetriggerView {
  protected readonly m_events = new IFreeRoundRetriggerViewEvents();

  constructor() {
    super('FreeRoundRetriggerView');
  }

  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;

    this.RuntimeAdd(IFreeRoundRetriggerView, this);
    this.RuntimeAdd(IFreeRoundRetriggerView.Events, this.m_events);

    return true;
  }

  Deinit() {
    this.RuntimeRemove(IFreeRoundRetriggerView);
    this.RuntimeRemove(IFreeRoundRetriggerView.Events);

    super.Deinit();
  }

  ShowRetriggerScreen(_freeRoundsCount: number) {
    this.m_events.retriggerMidway.Post();
    this.m_events.retriggerFinished.Post();
  }

  Clear() {
  }
}
