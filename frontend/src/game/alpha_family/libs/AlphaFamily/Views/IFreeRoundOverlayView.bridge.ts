// Egt::Game::AlphaFamily::IFreeRoundOverlayView (AlphaFamily/Views/IFreeRoundOverlayView.bridge.h): above the reels for special effects.

import { Event } from '@game/engine/Core/Event';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IFreeRoundOverlayView extends IControlView {
  ShowIntro(): void;
  ShowOutro(): void;
  Clear(): void;
  SetRewardedAmount(rewarded: number, currencyType: CurrencyType): void;
  SetFreeSpinsRewarded(rewarded: number): void;
}

export class IFreeRoundOverlayViewEvents extends IControlViewEvents {
  readonly introMidway = new Event();
  readonly introFinished = new Event();

  readonly outroMidway = new Event();
  readonly outroFinished = new Event();
}

export const IFreeRoundOverlayView = Interface<IFreeRoundOverlayView, IFreeRoundOverlayViewEvents>('IFreeRoundOverlayView');
