// The browser game's ModuleManager: it creates the engine's modules, its family's and the game's (by their modules
// configs), initializes
// them in order, then runs them every frame: Process in order (the kernel answers, the views move, the state machine
// reacts), then PostProcess (the video draws the frame).

import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { IModule, ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { AudioManager } from '@game/engine/AudioManager/AudioManager';
import { FileWatch } from '@game/engine/FileWatch/FileWatch';
import { ResourceManager } from '@game/engine/ResourceManager/ResourceManager';
import { VideoManager } from '@game/engine/VideoManager/VideoManager';
import { AlphaFamilyGameflow } from '@game/integration/AlphaFamilyGameflow/AlphaFamilyGameflow';
import { BrowserKernel, type BrowserKernelConfig } from '@game/integration/BrowserKernel/BrowserKernel';
import type { GameAssetReport, GameProject, GameProjectModule } from './GameBackend';
import { MODULES } from './ModuleRegistry';

export interface GameModuleEntry {
  name: string;
  module: IModule;
  config: ModuleConfig;
  engine: boolean;
}

export interface GameStartOptions {
  canvas: HTMLCanvasElement;
  /** The info screen, with the help pages. */
  infoCanvas?: HTMLCanvasElement | null;
  /** The topper screen. */
  topperCanvas?: HTMLCanvasElement | null;
  project: GameProject;
  report: GameAssetReport | null;
  kernel?: BrowserKernelConfig;
}

export class GameApp {
  readonly runtime = new Runtime();
  readonly modules: GameModuleEntry[] = [];
  /** Modules of the config that the browser game does not have. */
  readonly skipped: string[] = [];
  private frame = 0;
  private running = false;
  onFrame: (() => void) | null = null;
  onError: ((error: Error) => void) | null = null;

  /** The game modules of a project's modules config, and those the browser game has. */
  static GameModules(project: GameProject): GameProjectModule[] {
    return project.modules?.config.modules ?? [];
  }

  static CanPlay(project: GameProject) {
    const modules = GameApp.GameModules(project);
    return modules.some(module => module.name in MODULES);
  }

  async Start(options: GameStartOptions) {
    const { project } = options;
    const capping = GameApp.Capping(project);
    this.Add('ResourceManager', new ResourceManager(project, options.report), {}, true);
    // a view reloads its elements list when its file changes (C++'s FileWatch, in debug and QA builds)
    this.Add('FileWatch', new FileWatch(), {}, true);
    this.Add('VideoManager', new VideoManager(options.canvas, options.infoCanvas ?? null, options.topperCanvas ?? null), {}, true);
    this.Add('AudioManager', new AudioManager(), {}, true);
    this.Add('BrowserKernel', new BrowserKernel(), { capping, ...options.kernel }, true);
    this.Add('AlphaFamilyGameflow', new AlphaFamilyGameflow(), {}, true);
    // The family's modules (the capping splash...), then the game's. The engine's are made above.
    const engine = new Set(this.modules.map(entry => entry.name));
    for (const module of [...(project.familyModules?.config.modules ?? []), ...GameApp.GameModules(project)]) {
      if (engine.has(module.name)) continue;
      const descriptor = MODULES[module.name];
      if (descriptor) this.Add(module.name, descriptor.create(), module.config ?? {}, false);
      else this.skipped.push(module.name);
    }
    for (const entry of this.modules) {
      if (!(await entry.module.Init(this.runtime, entry.config))) throw new Error(`${entry.name}: Init failed`);
    }
    for (const entry of this.modules) {
      if (!entry.module.PostInit()) throw new Error(`${entry.name}: PostInit failed`);
    }
    this.running = true;
    this.frame = requestAnimationFrame(this.Frame);
  }

  /** The math's capping, from the setup's maxCap. */
  private static Capping(project: GameProject) {
    for (const module of GameApp.GameModules(project)) {
      const setups = (module.config?.setups ?? []) as { maxCap?: number | null }[];
      if (setups[0]?.maxCap) return setups[0].maxCap;
    }
    return 0;
  }

  private Add(name: string, module: IModule, config: ModuleConfig, engine: boolean) {
    this.modules.push({ name, module, config, engine });
  }

  Get<T extends IModule>(type: new (...args: never[]) => T): T | null {
    return (this.modules.find(entry => entry.module instanceof type)?.module as T) ?? null;
  }

  private Frame = () => {
    if (!this.running) return;
    try {
      for (const entry of this.modules) entry.module.Process();
      for (const entry of this.modules) entry.module.PostProcess();
      this.onFrame?.();
    } catch (error) {
      this.running = false;
      console.error(error);
      this.onError?.(error as Error);
      return;
    }
    this.frame = requestAnimationFrame(this.Frame);
  };

  Stop() {
    this.running = false;
    cancelAnimationFrame(this.frame);
    for (const entry of [...this.modules].reverse()) {
      try {
        entry.module.PreDeinit();
      } catch (error) {
        console.error(error);
      }
    }
    for (const entry of [...this.modules].reverse()) {
      try {
        entry.module.Deinit();
      } catch (error) {
        console.error(error);
      }
    }
    this.modules.length = 0;
  }
}
