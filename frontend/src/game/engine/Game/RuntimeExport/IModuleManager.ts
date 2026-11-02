// Egt::Game::IModuleManager (Egt/Game/RuntimeExport/IModuleManager.h): the module manager, which loads a module while
// the game runs and unloads it (the automation's view module). The browser game's is the GameApp.

import { Interface, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

/** Egt::ModuleConfig: the module's name, and its config. */
export interface ModuleLoadConfig {
  name: string;
  config: ModuleConfig;
}

export interface IModuleManager {
  LoadModule(runtime: Runtime, config: ModuleLoadConfig): boolean;
  UnloadModule(name: string): void;
  IsModuleLoaded(name: string): boolean;
}

export class IModuleManagerEvents {}

export const IModuleManager = Interface<IModuleManager, IModuleManagerEvents>('IModuleManager');
