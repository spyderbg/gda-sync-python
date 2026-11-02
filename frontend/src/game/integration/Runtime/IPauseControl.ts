// Egt::Integration::IPauseControl (Egt/Integration/Runtime/IPauseControl.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum PauseReason {
  Platform,
  Message,
  Debug,
  Qa,
}

/// Asks for the game pause and lets it go, each source under its own reason. The game stays paused while any
/// reason is held, so one source letting go never resumes a pause another one still holds.
export interface IPauseControl {
  Request(reason: PauseReason): void;
  Release(reason: PauseReason): void;
  IsHeld(reason: PauseReason): boolean;
}

export const IPauseControl = Interface<IPauseControl>('IPauseControl');
