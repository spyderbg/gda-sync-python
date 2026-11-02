// Egt::Game::AlphaFamily::Stub::StubNumericBarView<Interface> (AlphaFamilyAutomationView/Components/StubNumericBarView.h):
// a stub of a numeric bar, which takes a value at once and says it is done animating.

import type { AccumulationDescriptor } from '@game/alpha_family/libs/AlphaFamily/Views/Tools/AccumulationControl.data';
import type { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubControl } from './StubControl';

export abstract class StubNumericBarView<Interface, Events extends INumericBarViewEvents = INumericBarViewEvents> extends StubControl<Interface, Events> {
  protected m_value = 0;

  ////////////////////////////////////////////////////////////////////////////////
  /// INumericBarView
  ////////////////////////////////////////////////////////////////////////////////

  SetAccumulation(descr: AccumulationDescriptor) {
    this.m_value = descr.targetValue;
    this.m_events!.animatingDone.Post(this.m_value);
  }

  SetValue(value: number) {
    this.m_value = value;
    this.m_events!.animatingDone.Post(this.m_value);
  }

  SetValueNow(value: number) {
    this.m_value = value;
    this.m_events!.animatingDone.Post(this.m_value);
  }

  FastForward() {}

  PlayBarAudioState(_audioStateName: string) {}
}
