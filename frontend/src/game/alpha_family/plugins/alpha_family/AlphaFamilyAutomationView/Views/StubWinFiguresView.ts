// Egt::Game::AlphaFamily::Stub::StubWinFiguresView (AlphaFamilyAutomationView/Views/StubWinFiguresView.h): the automation's IWinFiguresView.

import type { SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IWinFiguresView, type IWinFiguresViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { StubView } from '../Components/StubView';

export class StubWinFiguresView extends StubView<IWinFiguresView, IWinFiguresViewEvents> implements IWinFiguresView {
  constructor() {
    super(IWinFiguresView);
  }

  // IControlView, which the browser's IWinFiguresView has too
  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  ShowCombinations(_combinations: ReelCombinations, _fast: boolean) {
    this.m_events!.animatingDone.Post();
  }

  ShowWinFigures(_figures: SymbolViewInfos) {
    this.m_events!.animatingDone.Post();
  }

  ShowComets(_comets: SymbolViewInfos) {
    this.m_events!.cometsAnimDone.Post();
  }

  RequestFastForwardComets() {}

  ClearFigures() {}

  SetStackedFigures(_figures: SymbolViewInfos) {}

  PauseAnimations() {}

  ResumeAnimations() {}
}
