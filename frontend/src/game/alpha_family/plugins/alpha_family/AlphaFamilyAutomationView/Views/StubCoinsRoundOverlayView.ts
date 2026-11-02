// Egt::Game::AlphaFamily::Stub::StubCoinsRoundOverlayView (AlphaFamilyAutomationView/Views/StubCoinsRoundOverlayView.h): the automation's ICoinsRoundOverlayView.

import { ICoinsRoundOverlayView, type ICoinsRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/ICoinsRoundOverlayView.bridge';
import { StubView } from '../Components/StubView';

export class StubCoinsRoundOverlayView extends StubView<ICoinsRoundOverlayView, ICoinsRoundOverlayViewEvents> implements ICoinsRoundOverlayView {
  constructor() {
    super(ICoinsRoundOverlayView);
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
