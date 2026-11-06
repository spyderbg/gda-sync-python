// Egt::Game::AlphaFamily::Stub::StubHoldAndSpinRoundOverlayView (AlphaFamilyAutomationView/Views/StubHoldAndSpinRoundOverlayView.h): the automation's IHoldAndSpinRoundOverlayView.

import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { type HoldAndSpinRoundOverlayTheme, IHoldAndSpinRoundOverlayView, type IHoldAndSpinRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';
import { StubView } from '../Components/StubView';

export class StubHoldAndSpinRoundOverlayView extends StubView<IHoldAndSpinRoundOverlayView, IHoldAndSpinRoundOverlayViewEvents> implements IHoldAndSpinRoundOverlayView {
  constructor() {
    super(IHoldAndSpinRoundOverlayView);
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

  SetRewardedAmount(_rewarded: number, _currencyType: CurrencyType) {}

  SetTheme(_theme: HoldAndSpinRoundOverlayTheme) {}

  Clear() {}

  HideIntro() {}

  SetHoldAndSpinBannerVisible(_isVisible: boolean) {}
}
