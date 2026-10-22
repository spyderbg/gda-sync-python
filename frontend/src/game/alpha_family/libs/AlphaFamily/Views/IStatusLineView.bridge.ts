// Egt::Game::AlphaFamily::IStatusLineView (AlphaFamily/Views/IStatusLineView.bridge.h): shows status text under
// IReelsView.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { ELeftStatusLine, ERightStatusLine, EStatusLine } from '../Math/Common/Common.data';
import type { ReelCombinations } from '../Math/Reel/ReelRoundPhase.data';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IStatusLineView extends IControlView {
  ShowStatus(state: EStatusLine): void;
  ShowCombinations(combinations: ReelCombinations, fast: boolean): void;
  // EStatusLine & ELeftStatusLine & ERightStatusLine can be visualized at the same time
  ShowRightStatus(state: ERightStatusLine): void;
  ShowLeftStatus(state: ELeftStatusLine): void;

  SetLanguage(language: string): void;

  PauseAnimations(): void;
  ResumeAnimations(): void;
}

export class IStatusLineViewEvents extends IControlViewEvents {
  // What the status line is asked to show: a value asked for before the view's elements are loaded
  // is posted once they are. Two asked within one frame are both posted, though only the second is
  // drawn; what reaches the screen is statusDrawn.
  readonly statusShown = new Event<[EStatusLine]>();
  readonly leftStatusShown = new Event<[ELeftStatusLine]>();
  readonly rightStatusShown = new Event<[ERightStatusLine]>();
  readonly combinationsShown = new Event<[ReelCombinations, boolean]>(); // the wins, and whether shown fast

  // What a drawn frame put on the screen, when it differs from the frame before (StatusLineDrawn):
  // whether the status line is drawn at all, then mid, left, right, the wins and whether shown fast.
  readonly statusDrawn = new Event<[boolean, EStatusLine, ELeftStatusLine, ERightStatusLine, ReelCombinations, boolean]>();
}

export const IStatusLineView = Interface<IStatusLineView, IStatusLineViewEvents>('IStatusLineView');
