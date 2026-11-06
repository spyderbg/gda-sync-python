// Egt::Game::AlphaFamily::Stub::StubHoldAndSpinBarView (AlphaFamilyAutomationView/Views/StubHoldAndSpinBarView.h): the automation's IHoldAndSpinBarView.

import { Currency, type PayoutSummary } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IHoldAndSpinBarView, type IHoldAndSpinBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { StubNumericBarView } from '../Components/StubNumericBarView';

export class StubHoldAndSpinBarView extends StubNumericBarView<IHoldAndSpinBarView, IHoldAndSpinBarViewEvents> implements IHoldAndSpinBarView {
  constructor() {
    super(IHoldAndSpinBarView);
  }

  ShowRemainder(_show: boolean) {}

  AddWinResult(summary: PayoutSummary) {
    this.m_value += summary.rewards.Get(Currency.HoldAndSpinEnergy);
    this.m_events!.animatingDone.Post(this.m_value);
  }

  SetBet(_bet: number) {}

  SetFeatureStarted(_featureStarted: boolean) {}

  IsValueAnimating() {
    return false;
  }

  ShowCompleted(_animate: boolean) {}
}
