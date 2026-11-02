// Egt::Game::AlphaFamily::Stub::StubInfoSwButtonView (AlphaFamilyAutomationView/Views/StubInfoSwButtonView.h): the automation's IInfoSwButtonView.

import { IInfoSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubInfoSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IInfoSwButtonView);
  }

}
