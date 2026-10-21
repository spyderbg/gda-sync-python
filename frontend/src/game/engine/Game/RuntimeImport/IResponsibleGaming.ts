// Egt::Game::IResponsibleGaming and IAppControl: the cabinet services around the game.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IResponsibleGaming {
  IsResponsibleGamingSetupEnable(): boolean;
  HasPendingResponsibleGamingWarning(): boolean;
  OpenResponsibleGamingWarning(): void;
  OpenResponsibleGamingSetupView(): void;
}

export class IResponsibleGamingEvents {
  readonly responsibleGamingWarning = new Event();
  readonly responsibleGamingCashout = new Event();
}

export const IResponsibleGaming = Interface<IResponsibleGaming, IResponsibleGamingEvents>('IResponsibleGaming');

export interface IAppControl {
  ExitGracefully(): boolean;
}

export const IAppControl = Interface<IAppControl>('IAppControl');
