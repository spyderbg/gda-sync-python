// Egt::Game::AlphaFamily::Stub::StubKnobsView (AlphaFamilyAutomationView/Views/StubKnobsView.h): the automation's IKnobsView.

import type { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EKnobsType, IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { StubControl } from '../Components/StubControl';

export class StubKnobsView extends StubControl<IKnobsView, IControlViewEvents> implements IKnobsView {
  constructor() {
    super(IKnobsView);
  }

  private m_knobsType = EKnobsType.Normal;

  SetKnobsType(type: EKnobsType) {
    this.m_knobsType = type;
  }
}
