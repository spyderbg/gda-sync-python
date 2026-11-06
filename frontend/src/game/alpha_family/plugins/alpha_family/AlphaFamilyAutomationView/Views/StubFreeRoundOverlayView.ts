// Egt::Game::AlphaFamily::Stub::StubFreeRoundOverlayView (AlphaFamilyAutomationView/Views/StubFreeRoundOverlayView.h): the automation's IFreeRoundOverlayView.

import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { IFreeRoundOverlayView, type IFreeRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundOverlayView.bridge';
import { StubView } from '../Components/StubView';

export class StubFreeRoundOverlayView extends StubView<IFreeRoundOverlayView, IFreeRoundOverlayViewEvents> implements IFreeRoundOverlayView {
  constructor() {
    super(IFreeRoundOverlayView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  ShowIntro() {
    this.m_events!.introMidway.Post();
    this.m_events!.introFinished.Post();
  }

  ShowOutro() {
    this.m_events!.outroMidway.Post();
    this.m_events!.outroFinished.Post();
  }

  Clear() {}

  SetRewardedAmount(_amount: number, _currencyType: CurrencyType) {}

  SetFreeSpinsRewarded(_spins: number) {}
}
