// Egt::Game::AlphaFamily::Stub::StubLineUpSwButtonView (AlphaFamilyAutomationView/Views/StubLineUpSwButtonView.h): the automation's ILineUpSwButtonView.

import { ILineUpSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubLineUpSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(ILineUpSwButtonView);
  }

}
