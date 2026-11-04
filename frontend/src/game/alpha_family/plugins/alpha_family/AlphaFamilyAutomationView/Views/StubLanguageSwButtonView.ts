// Egt::Game::AlphaFamily::Stub::StubLanguageSwButtonView (AlphaFamilyAutomationView/Views/StubLanguageSwButtonView.h): the automation's ILanguageSwButtonView.

import { ILanguageSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubLanguageSwButtonView extends StubSwButton<ILanguageSwButtonView> implements ILanguageSwButtonView {
  constructor() {
    super(ILanguageSwButtonView);
  }
}
