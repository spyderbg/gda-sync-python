// Egt::Game::AlphaFamily::Stub::StubLineDownSwButtonView (AlphaFamilyAutomationView/Views/StubLineDownSwButtonView.h): the automation's ILineDownSwButtonView.

import { ILineDownSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubLineDownSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(ILineDownSwButtonView);
  }

}
