// Egt::Game::IResponsibleGaming, IAppControl, IAttendance and IAutoExit: the cabinet services around the game.

import { Event } from '../../Core/Event';
import { Interface } from '../../GameCore/RuntimeAccess';

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
