// Egt::Game::AlphaFamily::Stub::StubHoldAndSpinRoundInfoView (AlphaFamilyAutomationView/Views/StubHoldAndSpinRoundInfoView.h): the automation's IHoldAndSpinRoundInfoView.

import type { SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IHoldAndSpinRoundInfoView, type IHoldAndSpinRoundInfoViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { StubView } from '../Components/StubView';

export class StubHoldAndSpinRoundInfoView extends StubView<IHoldAndSpinRoundInfoView, IHoldAndSpinRoundInfoViewEvents> implements IHoldAndSpinRoundInfoView {
  constructor() {
    super(IHoldAndSpinRoundInfoView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  ShowIntro() {
    this.m_events!.introFinished.Post();
  }

  ShowMain() {
    this.m_events!.mainFinished.Post();
  }

  ShowOutro() {
    this.m_events!.outroFinished.Post();
  }

  ShowComets(_comets: SymbolViewInfos) {
    this.m_events!.cometsAnimDone.Post();
  }

  RequestFastForwardComets() {}

  Clear() {}

  SetCollectedShields(_shields: number) {}

  SetStakes(_bet: number, _lines: number) {}

  SetPaytables(..._paytables: unknown[]) {}
}
