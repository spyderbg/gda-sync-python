// Egt::Game::AlphaFamily::Stub::StubHoldAndSpinBarView (AlphaFamilyAutomationView/Views/StubHoldAndSpinBarView.h): the automation's IHoldAndSpinBarView.

import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IHoldAndSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { INumericBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubHoldAndSpinBarView extends StubNumericBarView<IHoldAndSpinBarView, INumericBarViewEvents> implements IHoldAndSpinBarView {
  constructor() {
    super(IHoldAndSpinBarView);
  }

  ShowRemainder(_show: boolean) {}

  AddWinResult(summary: PayoutSummary) {
    this.m_value += summary.rewards.Get(Currency.HoldAndSpinEnergy);
    this.m_events!.animatingDone.Post(this.m_value);
  }

  SetBet(_bet: number) {}
}
