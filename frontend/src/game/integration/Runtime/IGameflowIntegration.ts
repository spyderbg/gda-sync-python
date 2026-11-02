// Egt::Integration::IGameflowIntegration (Egt/Integration/Runtime/IGameflowIntegration.h): the gameflow as the
// integration's modules see it, the RNG Queue and the automation: its state, the round's random numbers, and its
// match and round events, each posted before (…ing) and after (…ed) the kernel's part.

import { Event } from '@game/engine/Core/Event';
import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import type { IRng } from '@game/engine/GameCore/Random/IRng';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IGameflowIntegration {
  IsIdle(): boolean;
  IsMatchStarting(): boolean;
  IsMatchStarted(): boolean;
  IsRoundStarted(): boolean;
  IsRoundStarting(): boolean;

  GetRoundRng(): IRng;
}

type Bet = number;
type Win = number;

export class IGameflowIntegrationEvents {
  readonly matchStarting = new Event<[Bet]>();
  readonly matchCanceled = new Event<[Bet]>();
  readonly matchStarted = new Event<[Bet]>();

  readonly roundStarting = new Event<[GameRoundType]>();
  readonly roundStarted = new Event<[GameRoundType]>();
  readonly roundEnding = new Event<[GameRoundType]>();
  readonly roundEnded = new Event<[GameRoundType]>();

  readonly matchEnding = new Event<[Win]>();
  readonly matchEnded = new Event<[Win]>();
}

export const IGameflowIntegration = Interface<IGameflowIntegration, IGameflowIntegrationEvents>('IGameflowIntegration');
