// Egt::Game::AlphaFamily::Stub::StubTetraRoundOverlayView (AlphaFamilyAutomationView/Views/StubTetraRoundOverlayView.h): the automation's ITetraRoundOverlayView.

import { ITetraRoundOverlayView, type ITetraRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { StubView } from '../Components/StubView';

export class StubTetraRoundOverlayView extends StubView<ITetraRoundOverlayView, ITetraRoundOverlayViewEvents> implements ITetraRoundOverlayView {
  constructor() {
    super(ITetraRoundOverlayView);
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
