// Egt::Game::AlphaFamily::IGambleRoundOverlayView (AlphaFamily/Views/IGambleRoundOverlayView.bridge.h): above the reels for special effects.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IGambleRoundOverlayView extends IControlView {
  StartIntro(): void;
  StartOutro(): void;
  Clear(): void;
}

export class IGambleRoundOverlayViewEvents extends IControlViewEvents {
  readonly introMidway = new Event();
  readonly introFinished = new Event();

  readonly outroMidway = new Event();
  readonly outroFinished = new Event();
}

export const IGambleRoundOverlayView = Interface<IGambleRoundOverlayView, IGambleRoundOverlayViewEvents>('IGambleRoundOverlayView');
