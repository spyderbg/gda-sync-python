// Egt::Game::AlphaFamily::StatusLineDrawn (AlphaFamily/Views/StatusLineDrawn.h).

import { ELeftStatusLine, ERightStatusLine, EStatusLine } from '../Math/Common/Common.data';
import { CombinationsEqual, type ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import type { IStatusLineViewEvents } from './IStatusLineView.bridge';

class Frame {
  drawn = false;
  mid = EStatusLine.None;
  left = ELeftStatusLine.None;
  right = ERightStatusLine.None;
  wins: ReelCombinations = [];
  fast = false;

  equals(rhs: Frame) {
    return this.drawn === rhs.drawn && this.mid === rhs.mid && this.left === rhs.left && this.right === rhs.right &&
      CombinationsEqual(this.wins, rhs.wins) && this.fast === rhs.fast;
  }
}

/// What a status line view put on the screen in its last drawn frame. The view calls Update from its Draw
/// every frame, and IStatusLineView::Events::statusDrawn is posted only when that frame differs from the one
/// before.
export class StatusLineDrawn {
  Update(events: IStatusLineViewEvents, drawn: boolean, mid: EStatusLine, left: ELeftStatusLine, right: ERightStatusLine, wins: ReelCombinations, fast: boolean) {
    const frame = new Frame();
    if (drawn) {
      frame.drawn = true;
      frame.mid = mid;
      frame.left = left;
      frame.right = right;
      if (mid === EStatusLine.ShowWinCombinations) {
        frame.wins = wins;
        frame.fast = fast;
      }
    }
    if (this.m_last && this.m_last.equals(frame)) {
      return;
    }
    this.m_last = frame;
    events.statusDrawn.Post(frame.drawn, frame.mid, frame.left, frame.right, frame.wins, frame.fast);
  }

  private m_last: Frame | null = null;
}
