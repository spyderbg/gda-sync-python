// Egt::Game::AlphaFamily::Stub::StubWheelRoundOverlayView (AlphaFamilyAutomationView/Views/StubWheelRoundOverlayView.h): the automation's IWheelRoundOverlayView.

import { IWheelRoundOverlayView, type IWheelRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundOverlayView.bridge';
import { StubView } from '../Components/StubView';

export class StubWheelRoundOverlayView extends StubView<IWheelRoundOverlayView, IWheelRoundOverlayViewEvents> implements IWheelRoundOverlayView {
  constructor() {
    super(IWheelRoundOverlayView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  StartIntro() {
    this.m_events!.introMidway.Post();
    this.m_events!.introFinished.Post();
  }

  StartOutro() {
    this.m_events!.outroMidway.Post();
    this.m_events!.outroFinished.Post();
  }

  Clear() {}
}
