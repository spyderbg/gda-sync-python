// Egt::Game::AlphaFamily::IExtraRoundOverlayView (AlphaFamily/Views/IExtraRoundOverlayView.bridge.h): above the reels for special effects.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IExtraRoundOverlayView extends IControlView {
  ShowIntro(): void;
  ShowOutro(): void;
  Clear(): void;
}

export class IExtraRoundOverlayViewEvents extends IControlViewEvents {
  readonly introMidway = new Event();
  readonly introFinished = new Event();

  readonly outroMidway = new Event();
  readonly outroFinished = new Event();
}

export const IExtraRoundOverlayView = Interface<IExtraRoundOverlayView, IExtraRoundOverlayViewEvents>('IExtraRoundOverlayView');
