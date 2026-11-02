// Egt::Game::AlphaFamily::Stub::StubExitGameSwButtonView (AlphaFamilyAutomationView/Views/StubExitGameSwButtonView.h): the automation's IExitGameSwButtonView.

import { IExitGameSwButtonView, type IExitGameSwButtonViewEvents, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubExitGameSwButtonView extends StubSwButton<ISwButtonBase, IExitGameSwButtonViewEvents> implements ISwButtonBase {
  constructor() {
    super(IExitGameSwButtonView);
  }

}
