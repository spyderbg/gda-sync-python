// Egt::Game::AlphaFamily::Stub::StubBigWinView (AlphaFamilyAutomationView/Views/StubBigWinView.h): the automation's IBigWinView.

import type { ERoundTags } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IBigWinView, type IBigWinViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { StubView } from '../Components/StubView';

export class StubBigWinView extends StubView<IBigWinView, IBigWinViewEvents> implements IBigWinView {
  constructor() {
    super(IBigWinView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  ApplyPhase(_phase: string) {
    this.m_events!.animatingDone.Post();
  }

  Clear() {}

  ShowAnimation(_tag: ERoundTags) {
    this.m_events!.animating.Post();
    this.m_events!.animatingDone.Post();
  }
}
