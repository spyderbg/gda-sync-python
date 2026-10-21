// Egt::ModuleManager IModule and BaseModule: a module of the game, created by name from the game's modules config
// (configs/<game>/modules/<Name>Modules.json) and run by the GameApp, like the C++ ModuleManager runs it.

import { Runtime, RuntimeHolder } from '@game/engine/GameCore/RuntimeAccess';

export type ModuleConfig = Record<string, unknown>;

export interface IModule {
  Init(runtime: Runtime, config: ModuleConfig): boolean | Promise<boolean>;
  PostInit(): boolean;
  Process(): void;
  PostProcess(): void;
  PreDeinit(): void;
  Deinit(): void;
}

export class BaseModule extends RuntimeHolder implements IModule {
  Init(runtime: Runtime, _config: ModuleConfig): boolean | Promise<boolean> {
    this.SetRuntime(runtime);
    return true;
  }

  PostInit() {
    return true;
  }

  Process() {}

  PostProcess() {}

  PreDeinit() {}

  Deinit() {
    this.SetRuntime(null);
  }
}
