// Egt::Game::AlphaFamily::Stub::StubReelsView (AlphaFamilyAutomationView/Views/StubReelsView.h): the automation's IReelsView.

import type { ERoundTags, Reels, SymbolGrid, SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IReelsView, type IReelsViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { StubView } from '../Components/StubView';

export class StubReelsView extends StubView<IReelsView, IReelsViewEvents> implements IReelsView {
  constructor() {
    super(IReelsView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  SetupNextStart(_start: string) {}

  SetupFakeReels(_reels: Reels) {}

  StartReeling() {
    this.m_reeling = true;
  }

  StartFastReelingStop() {
    if (this.m_reeling) {
      this.m_reeling = false;
      this.m_events!.allReelsStopEvent.Post();
    }
  }

  StartNormalReelingStop(_delay: number) {
    if (this.m_reeling) {
      this.m_reeling = false;
      this.m_events!.allReelsStopEvent.Post();
    }
  }

  StartFastReelStop(_reel: number) {
    if (this.m_reeling) {
      this.m_reeling = false;
      this.m_events!.allReelsStopEvent.Post();
    }
  }

  SetStopFigures(_stop: SymbolGrid) {}

  SetSymbolsAroundStop(_before: SymbolGrid, _after: SymbolGrid) {}

  SetReelTags(_reel: number, _tags: ERoundTags[]) {}

  ShowStopFigures() {}

  ShowSymbolsExpanding(_symbolGrid: SymbolGrid, _expanded: SymbolGrid) {
    this.m_events!.symbolsExpanded.Post();
  }

  ClearExpandSymbols() {}

  ShowHoldAndSpinPhase(_stop: SymbolGrid, _drops: SymbolGrid) {
    this.m_events!.holdAndSpinFinished.Post();
  }

  ClearHoldAndSpinSymbols() {}

  ShowCombinations(_combinations: ReelCombinations | SymbolViewInfos) {}

  ClearCombinations() {}

  private m_reeling = false;
}
