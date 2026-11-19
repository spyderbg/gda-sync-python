// Egt::Game::IPause (Game/RuntimeImport/IPause.h).

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

/// Whether the game is held still, whoever asked for it: the platform, a blocking message, a debug tool or QA.
/// The game only reacts; the integration owns the pause (Integration::IPauseControl).
export interface IPause {
  IsPaused(): boolean;
}

export class IPauseEvents {
  readonly paused = new Event();
  readonly resumed = new Event();
}

export const IPause = Interface<IPause, IPauseEvents>('IPause');
