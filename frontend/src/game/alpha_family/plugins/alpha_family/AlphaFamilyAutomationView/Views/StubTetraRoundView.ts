// Egt::Game::AlphaFamily::Stub::StubTetraRoundView (AlphaFamilyAutomationView/Views/StubTetraRoundView.h): the automation's ITetraRoundView.

import type { Reels, SymbolGrid } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ITetraRoundView, type ITetraRoundViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import { StubView } from '../Components/StubView';

export class StubTetraRoundView extends StubView<ITetraRoundView, ITetraRoundViewEvents> implements ITetraRoundView {
  constructor() {
    super(ITetraRoundView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  SetupFakeReels(_subScreen: number, _reels: Reels) {}

  StartReeling() {}

  SetStopFigures(_subScreen: number, _stop: SymbolGrid) {}

  SetSymbolsAroundStop(_subScreen: number, _before: SymbolGrid, _after: SymbolGrid) {}

  StartNormalReelingStop(_subScreen: number, _delay: number) {
    if (this.m_events !== null) {
      this.m_events.allReelsStopEvent.Post();
    }
  }

  StartFastReelingStop(_subScreen: number) {
    if (this.m_events !== null) {
      this.m_events.allReelsStopEvent.Post();
    }
  }

  ShowCombinations(subScreen: number, _combinations: ReelCombinations, _fast: boolean, _loop: boolean) {
    if (this.m_events !== null) {
      this.m_events.showCombinationsFinished.Post(subScreen);
    }
  }

  StartFastCombinationsStop(_subScreen: number) {}

  ClearCombinations(_subScreen: number) {}

  SetDimmed(_subScreen: number, _dimmed: boolean) {
    if (this.m_events !== null) {
      this.m_events.dimFinished.Post();
    }
  }

  SetWinValue(_subScreen: number, _win: number) {}

  Clear() {}

  SetTetraFlyingSymbols(_subScreen: number, _symbols: SymbolGrid) {}

  StartFlyingAnimation(_subScreen: number) {
    if (this.m_events !== null) {
      this.m_events.flyAnimationEndEvent.Post();
    }
  }
}
