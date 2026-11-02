// Egt::Game::AlphaFamily::Stub::StubCappingSplashView (AlphaFamilyAutomationView/Views/StubCappingSplashView.h): the automation's ICappingSplashView.

import { ICappingSplashView, type ICappingSplashViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/ICappingSplashView.bridge';
import { StubView } from '../Components/StubView';

export class StubCappingSplashView extends StubView<ICappingSplashView, ICappingSplashViewEvents> implements ICappingSplashView {
  constructor() {
    super(ICappingSplashView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  ShowCappingSplashView(_remainingFeatures: boolean) {
    this.m_events!.splashIdleDismissed.Post();
  }

  HideCappingSplashView() {}
}
