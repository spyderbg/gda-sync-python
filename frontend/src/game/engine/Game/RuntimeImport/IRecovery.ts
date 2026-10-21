// Egt::Game::IRecovery: state change actions, which a state requests from a const handler and commits when the
// machine delivers them back (so a replay repeats them).

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IStateChangeAction {
  GetData<T>(type: new () => T): T | null;
  Commit(data: unknown): void;
}

export interface IRecovery {
  RequestStateChangeAction(action: object): void;
}

export class IRecoveryEvents {
  readonly onStateChangeAction = new Event<[IStateChangeAction]>();
}

export const IRecovery = Interface<IRecovery, IRecoveryEvents>('IRecovery');
