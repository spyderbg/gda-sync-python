// Egt::Game::AlphaFamily::Stub::StubCoinsWinBarView (AlphaFamilyAutomationView/Views/StubCoinsWinBarView.h): the automation's ICoinsWinBarView.

import type { PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ICoinsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubCoinsWinBarView extends StubNumericBarView<ICoinsWinBarView, INumericBarViewEvents> implements ICoinsWinBarView {
  constructor() {
    super(ICoinsWinBarView);
  }

  AddWinResult(_summary: PayoutSummary) {}
}
