// Egt::Game::AlphaFamily::Stub::StubFreeRoundRetriggerView (AlphaFamilyAutomationView/Views/StubFreeRoundRetriggerView.h): the automation's IFreeRoundRetriggerView.

import { IFreeRoundRetriggerView, type IFreeRoundRetriggerViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundRetriggerView.bridge';
import { StubView } from '../Components/StubView';

export class StubFreeRoundRetriggerView extends StubView<IFreeRoundRetriggerView, IFreeRoundRetriggerViewEvents> implements IFreeRoundRetriggerView {
  constructor() {
    super(IFreeRoundRetriggerView);
  }

  ShowRetriggerScreen(_spins: number) {
    this.m_events!.retriggerMidway.Post();
    this.m_events!.retriggerFinished.Post();
  }

  Clear() {}
}
