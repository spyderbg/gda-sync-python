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
  // What the status line draws, when it draws it: a value asked for before the view's elements
  // are loaded is posted once they are, as it is drawn then.
  readonly statusShown = new Event<[EStatusLine]>();
  readonly leftStatusShown = new Event<[ELeftStatusLine]>();
  readonly rightStatusShown = new Event<[ERightStatusLine]>();
  readonly combinationsShown = new Event<[ReelCombinations, boolean]>(); // the wins, and whether shown fast
}

export const IStatusLineView = Interface<IStatusLineView, IStatusLineViewEvents>('IStatusLineView');
