// Egt::Game::AlphaFamily::Stub::StubBetBarView (AlphaFamilyAutomationView/Views/StubBetBarView.h): the automation's IBetBarView.

import { IBetBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubBetBarView extends StubNumericBarView<IBetBarView, INumericBarViewEvents> implements IBetBarView {
  constructor() {
    super(IBetBarView);
  }

  SetCurrency(_currency: CurrencyType) {}
}
