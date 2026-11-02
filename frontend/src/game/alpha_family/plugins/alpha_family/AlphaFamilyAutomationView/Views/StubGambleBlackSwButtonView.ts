// Egt::Game::AlphaFamily::Stub::StubGambleBlackSwButtonView (AlphaFamilyAutomationView/Views/StubGambleBlackSwButtonView.h): the automation's IGambleBlackSwButtonView.

import { IGambleBlackSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubGambleBlackSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IGambleBlackSwButtonView);
  }

}
