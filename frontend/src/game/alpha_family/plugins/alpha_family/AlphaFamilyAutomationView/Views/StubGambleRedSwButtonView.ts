// Egt::Game::AlphaFamily::Stub::StubGambleRedSwButtonView (AlphaFamilyAutomationView/Views/StubGambleRedSwButtonView.h): the automation's IGambleRedSwButtonView.

import { IGambleRedSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubGambleRedSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IGambleRedSwButtonView);
  }

}
