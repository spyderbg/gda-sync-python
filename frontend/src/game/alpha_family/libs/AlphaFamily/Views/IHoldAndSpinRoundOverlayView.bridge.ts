// Egt::Game::AlphaFamily::IHoldAndSpinRoundOverlayView (AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge.h): above the reels for special scene effects.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IHoldAndSpinRoundOverlayView extends IControlView {
  ShowIntro(): void;
  HideIntro(): void;
  ShowOutro(): void;
  Clear(): void;
  SetHoldAndSpinBannerVisible(visible: boolean): void;
}

export class IHoldAndSpinRoundOverlayViewEvents extends IControlViewEvents {
  readonly introMidway = new Event();
  readonly introFinished = new Event();

  readonly outroMidway = new Event();
  readonly outroFinished = new Event();
}

export const IHoldAndSpinRoundOverlayView = Interface<IHoldAndSpinRoundOverlayView, IHoldAndSpinRoundOverlayViewEvents>('IHoldAndSpinRoundOverlayView');
