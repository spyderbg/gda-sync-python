// Egt::Game::AlphaFamily::Stub::StubAutoPlayView (AlphaFamilyAutomationView/Views/StubAutoPlayView.h): the automation's IAutoPlayView.

import { IAutoPlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { StubView } from '../Components/StubView';

export class StubAutoPlayView extends StubView<IAutoPlayView, never> implements IAutoPlayView {
  constructor() {
    super(IAutoPlayView);
  }

  SetAutoPlay(_on: boolean) {}

  IsAutoPlayOn() {
    return false;
  }
}
