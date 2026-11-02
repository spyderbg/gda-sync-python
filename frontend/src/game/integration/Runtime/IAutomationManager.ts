// Egt::Integration::IAutomationManager (Egt/Integration/Runtime/IAutomationManager.h, IAutomationManager.data.h): the
// automation as the gameflow sees it. While it plays games on its own numbers (generated with a seed, or replayed),
// ShouldOverrideRng is true and GetOverrideRng is their engine.

import { Event } from '@game/engine/Core/Event';
import type { IRng } from '@game/engine/GameCore/Random/IRng';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export enum AutomationMode {
  Undefined,
  Disabled,
  ReplayGame,
  ReplayAllGames,
  GenerateGames,
}

export interface IAutomationManager {
  ShouldOverrideRng(): boolean;
  GetOverrideRng(): IRng;
}

export class IAutomationManagerEvents {
  readonly automationStarted = new Event<[AutomationMode]>();
  readonly automationStopped = new Event<[AutomationMode]>();
}

export const IAutomationManager = Interface<IAutomationManager, IAutomationManagerEvents>('IAutomationManager');
