// Egt::Game::AlphaFamily::Stub::StubCreditBarView (AlphaFamilyAutomationView/Views/StubCreditBarView.h): the automation's ICreditBarView.

import { ICreditBarView, type ICreditBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubCreditBarView extends StubNumericBarView<ICreditBarView, ICreditBarViewEvents> implements ICreditBarView {
  constructor() {
    super(ICreditBarView);
  }

  Minimize(_animate: boolean) {}

  Maximize(_animate: boolean) {}
}
