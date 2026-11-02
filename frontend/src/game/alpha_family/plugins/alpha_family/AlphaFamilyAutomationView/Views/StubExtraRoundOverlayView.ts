// Egt::Game::AlphaFamily::Stub::StubExtraRoundOverlayView (AlphaFamilyAutomationView/Views/StubExtraRoundOverlayView.h): the automation's IExtraRoundOverlayView.

import { IExtraRoundOverlayView, type IExtraRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IExtraRoundOverlayView.bridge';
import { StubView } from '../Components/StubView';

export class StubExtraRoundOverlayView extends StubView<IExtraRoundOverlayView, IExtraRoundOverlayViewEvents> implements IExtraRoundOverlayView {
  constructor() {
    super(IExtraRoundOverlayView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  ShowIntro() {
    this.m_events!.introMidway.Post();
    this.m_events!.introFinished.Post();
  }

  ShowOutro() {
    this.m_events!.outroMidway.Post();
    this.m_events!.outroFinished.Post();
  }

  Clear() {}
}
