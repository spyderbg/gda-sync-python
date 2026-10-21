// Egt::Game::AlphaFamily::States::ISystemManager (AlphaFamily/States/ISystemManager.h, ISystemManager.data.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface ISystemManager {
  HasPendingCashout(): boolean;
  HasPendingExit(): boolean;
  RequestPendingCashout(): void;
  RequestPendingExit(): void;
  ClearPendingCashout(): void;
  ClearPendingExit(): void;
}

export class SystemManagerNvrams {}

export class SystemManagerStatics {
  hasPendingCashout = false;
  hasPendingExit = false;
}

export const ISystemManager = Interface<ISystemManager, object>('ISystemManager');
