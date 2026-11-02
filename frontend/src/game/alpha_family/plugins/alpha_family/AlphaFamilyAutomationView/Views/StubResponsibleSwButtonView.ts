// Egt::Game::AlphaFamily::Stub::StubResponsibleSwButtonView (AlphaFamilyAutomationView/Views/StubResponsibleSwButtonView.h): the automation's IResponsibleSwButtonView.

import { IResponsibleSwButtonView, type ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubResponsibleSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IResponsibleSwButtonView);
  }

}
