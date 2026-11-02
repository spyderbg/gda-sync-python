// Egt::Game::IDebugAutomation (Egt/Game/RuntimeExport/IDebugAutomation.h): whether the automation plays the game.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { RuntimeCategory } from '../RuntimeCategory';

export interface IDebugAutomation {
  IsStarted(): boolean;
}

export class IDebugAutomationEvents {
  static readonly RuntimeCategory = RuntimeCategory.GameDebug;

  readonly automationStarted = new Event();
  readonly automationStopped = new Event();
}

export const IDebugAutomation = Interface<IDebugAutomation, IDebugAutomationEvents>('IDebugAutomation');
