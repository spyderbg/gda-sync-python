// Egt::Game::AlphaFamily::Stub::StubBetUpSwButtonView (AlphaFamilyAutomationView/Views/StubBetUpSwButtonView.h): the automation's IBetUpSwButtonView.

import { IBetUpSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubBetUpSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IBetUpSwButtonView);
  }

}
