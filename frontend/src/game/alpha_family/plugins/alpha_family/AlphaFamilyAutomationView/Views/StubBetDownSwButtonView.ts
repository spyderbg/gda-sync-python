// Egt::Game::AlphaFamily::Stub::StubBetDownSwButtonView (AlphaFamilyAutomationView/Views/StubBetDownSwButtonView.h): the automation's IBetDownSwButtonView.

import { IBetDownSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubBetDownSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IBetDownSwButtonView);
  }

}
