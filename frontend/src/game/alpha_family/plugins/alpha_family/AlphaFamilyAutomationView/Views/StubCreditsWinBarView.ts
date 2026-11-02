// Egt::Game::AlphaFamily::Stub::StubCreditsWinBarView (AlphaFamilyAutomationView/Views/StubCreditsWinBarView.h): the automation's ICreditsWinBarView.

import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { type EWinBarState, ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubCreditsWinBarView extends StubNumericBarView<ICreditsWinBarView, INumericBarViewEvents> implements ICreditsWinBarView {
  constructor() {
    super(ICreditsWinBarView);
  }

  AddWinResult(summary: PayoutSummary) {
    this.m_value += summary.rewards.Get(Currency.Credits);
    this.m_events!.animatingDone.Post(this.m_value);
  }

  SetLabelState(_state: EWinBarState) {}

  AddWinResultFast(summary: PayoutSummary) {
    this.m_value += summary.rewards.Get(Currency.Credits);
    this.m_events!.animatingDone.Post(this.m_value);
  }
}
