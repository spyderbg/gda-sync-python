// Egt::Game::AlphaFamily::Stub::StubReelsOverlayView (AlphaFamilyAutomationView/Views/StubReelsOverlayView.h): the automation's IReelsOverlayView.

import { type EReelsOverlayType, IReelsOverlayView, type IReelsOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsOverlayView.bridge';
import { StubView } from '../Components/StubView';

export class StubReelsOverlayView extends StubView<IReelsOverlayView, IReelsOverlayViewEvents> implements IReelsOverlayView {
  constructor() {
    super(IReelsOverlayView);
  }

  SetType(_type: EReelsOverlayType) {}
}
