// Egt::Game::AlphaFamily::Stub::StubStatusLineView (AlphaFamilyAutomationView/Views/StubStatusLineView.h): the automation's IStatusLineView.

import type { ELeftStatusLine, ERightStatusLine, EStatusLine } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelCombinations } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { IStatusLineView, type IStatusLineViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { StubControl } from '../Components/StubControl';

export class StubStatusLineView extends StubControl<IStatusLineView, IStatusLineViewEvents> implements IStatusLineView {
  constructor() {
    super(IStatusLineView);
  }

  // ?.: a game's status line may register its base events, without these (Burning Crown's)
  ShowStatus(state: EStatusLine) {
    if (this.m_events) {
      this.m_events.statusShown?.Post(state);
    }
  }

  ShowCombinations(combinations: ReelCombinations, fast: boolean) {
    if (this.m_events) {
      this.m_events.combinationsShown?.Post(combinations, fast);
    }
  }

  ShowRightStatus(state: ERightStatusLine) {
    if (this.m_events) {
      this.m_events.rightStatusShown?.Post(state);
    }
  }

  ShowLeftStatus(state: ELeftStatusLine) {
    if (this.m_events) {
      this.m_events.leftStatusShown?.Post(state);
    }
  }

  SetLanguage(_language: string) {}

  PauseAnimations() {}

  ResumeAnimations() {}
}
