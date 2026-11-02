// Egt::Game::AlphaFamily::Stub::StubExtraSpinBarView (AlphaFamilyAutomationView/Views/StubExtraSpinBarView.h): the automation's IExtraSpinBarView.

import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IExtraSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubExtraSpinBarView extends StubNumericBarView<IExtraSpinBarView, INumericBarViewEvents> implements IExtraSpinBarView {
  constructor() {
    super(IExtraSpinBarView);
  }

  ShowRemainder(_show: boolean) {}

  AddWinResult(summary: PayoutSummary) {
    this.m_value += summary.rewards.Get(Currency.ExtraSpinEnergy);
    this.m_events!.animatingDone.Post(this.m_value);
  }
}
