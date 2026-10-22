// Egt::Game::AlphaFamily::ICoinsRoundOverlayView (AlphaFamily/Views/ICoinsRoundOverlayView.bridge.h): above the reels for special effects.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface ICoinsRoundOverlayView extends IControlView {
  ShowIntro(): void;
  ShowOutro(): void;
  Clear(): void;
}

export class ICoinsRoundOverlayViewEvents extends IControlViewEvents {
  readonly introMidway = new Event();
  readonly introFinished = new Event();

  readonly outroMidway = new Event();
  readonly outroFinished = new Event();
}

export const ICoinsRoundOverlayView = Interface<ICoinsRoundOverlayView, ICoinsRoundOverlayViewEvents>('ICoinsRoundOverlayView');
