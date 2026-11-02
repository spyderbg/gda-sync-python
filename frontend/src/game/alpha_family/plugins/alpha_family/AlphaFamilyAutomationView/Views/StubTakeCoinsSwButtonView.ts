// Egt::Game::AlphaFamily::Stub::StubTakeCoinsSwButtonView (AlphaFamilyAutomationView/Views/StubTakeCoinsSwButtonView.h): the automation's ITakeCoinsSwButtonView.

import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubTakeCoinsSwButtonView extends StubSwButton<ITakeCoinsSwButtonView> implements ITakeCoinsSwButtonView {
  constructor() {
    super(ITakeCoinsSwButtonView);
  }

  EnableButtonSkin(enabled: boolean) {
    this.SetEnabled(enabled);
  }
}
