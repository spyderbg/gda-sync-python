// Egt::Game::AlphaFamily::IReelsOverlayView (AlphaFamily/Views/IReelsOverlayView.bridge.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum EReelsOverlayType {
  Main,
  HoldAndSpin,
}

export interface IReelsOverlayView {
  SetType(type: EReelsOverlayType): void;
}

export class IReelsOverlayViewEvents {}

export const IReelsOverlayView = Interface<IReelsOverlayView, IReelsOverlayViewEvents>('IReelsOverlayView');
