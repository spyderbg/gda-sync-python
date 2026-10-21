// Egt::Game::IAttendance (IAttendance.bridge.h, IAttendance.data.h) and IAutoExit (IAutoExit.bridge.h): the cabinet's
// inactivity timers. The browser kernel has neither: the game's states react to them where the cabinet has them.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum AttendanceDurationType {
  NoCreditInIdle,
  LessThanMinBetCreditInIdle,
}

export interface IAttendance {
  /** In ms, as C++'s steady_clock::duration. */
  GetInactivityDuration(): number;
  GetDuration(type: AttendanceDurationType): number | null;
}

export class IAttendanceEvents {
  // Fired periodically while the machine is inactive.
  // Payload is the total accumulated inactivity duration.
  readonly inactivityTick = new Event<[number]>();

  // Fired once when activity resumes after a period of inactivity.
  // Payload is the total duration of the inactivity that just ended.
  readonly activityResumed = new Event<[number]>();
}

export const IAttendance = Interface<IAttendance, IAttendanceEvents>('IAttendance');

export interface IAutoExit {}

export class IAutoExitEvents {
  // Fired once when the zero-credit-after-match countdown expires.
  readonly zeroCreditAfterMatchTimeout = new Event();
}

export const IAutoExit = Interface<IAutoExit, IAutoExitEvents>('IAutoExit');
