// Egt::Game::AlphaFamily::Stub::StubLinesView (AlphaFamilyAutomationView/Views/StubLinesView.h): the automation's ILinesView.

import type { ERoundTags } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombination, ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { ILinesView, type ILinesViewEvents, type LineType } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { StubView } from '../Components/StubView';

export class StubLinesView extends StubView<ILinesView, ILinesViewEvents> implements ILinesView {
  constructor() {
    super(ILinesView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  SetWinLineTags(_tags: ERoundTags[]) {}

  ShowWinLine(_combination: ReelCombination, _lineType: LineType) {
    this.m_events!.showFastLinesFinished.Post();
  }

  ShowCombinations(_combinations: ReelCombinations, _fast: boolean, _loop: boolean) {
    this.m_events!.showCombinationsFinished.Post();
  }

  UpdateShownCombinations(_fast: boolean) {}

  PlayWinLinesSounds(_sound: string) {}

  StopWinLinesSounds(_sound: string) {}

  StopAllSounds() {}

  PlayBackgroundMusic(_music: string) {}

  StopBackgroundMusic(_music: string) {}

  ClearLines() {}

  PauseAnimations() {}

  ResumeAnimations() {}
}
