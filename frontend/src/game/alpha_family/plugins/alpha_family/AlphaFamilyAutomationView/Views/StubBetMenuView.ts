// Egt::Game::AlphaFamily::Stub::StubBetMenuView (AlphaFamilyAutomationView/Views/StubBetMenuView.h): the automation's IBetMenuView.

import { IBetMenuView, type IBetMenuViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { StubControl } from '../Components/StubControl';

export class StubBetMenuView extends StubControl<IBetMenuView, IBetMenuViewEvents> implements IBetMenuView {
  constructor() {
    super(IBetMenuView);
  }

  OpenMenu() {
    this.m_events!.menuOpening.Post();
    this.m_events!.menuOpened.Post();
  }

  CloseMenu() {
    this.m_events!.menuClosing.Post();
    this.m_events!.menuClosed.Post();
  }

  SetPossibleTotalBets(_bets: number[]) {}

  SetSelectedTotalBet(_bet: number) {}

  SetBetLimit(_limit: number) {}

  SetCurrency(_currency: CurrencyType) {}

  SetPossibleLines(_lines: number[]) {}

  SetSelectedLines(_lines: number) {}

  SetButtonUpEnabled(_enabled: boolean) {}

  SetButtonDownEnabled(_enabled: boolean) {}
}
