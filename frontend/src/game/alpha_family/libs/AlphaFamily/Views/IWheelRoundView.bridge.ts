// Egt::Game::AlphaFamily::IWheelRoundView (AlphaFamily/Views/IWheelRoundView.bridge.h).

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { type IControlView, IControlViewEvents } from './BaseInterfaces/IControlView';

export interface IWheelRoundView extends IControlView {
  SetSectorWins(sectorWinAmount: number[], startSectorIndex: number): void;
  StartSpinning(): void;
  StopSpinning(stopSectorIndex: number): void;
  StartPresentingWin(): void;
  Clear(): void;
}

export class IWheelRoundViewEvents extends IControlViewEvents {
  readonly spinningStarted = new Event();
  readonly spinningFinished = new Event();
  readonly winPresentingFinished = new Event();
}

export const IWheelRoundView = Interface<IWheelRoundView, IWheelRoundViewEvents>('IWheelRoundView');
