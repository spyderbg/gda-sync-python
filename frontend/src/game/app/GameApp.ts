// The browser game's ModuleManager: it creates the engine's modules, its family's and the game's (by their modules
// configs), initializes
// them in order, then runs them every frame: Process in order (the kernel answers, the views move, the state machine
// reacts), then PostProcess (the video draws the frame).

import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IModuleManager, type ModuleLoadConfig } from '@game/engine/Game/RuntimeExport/IModuleManager';
import type { IModule, ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { AudioManager } from '@game/engine/AudioManager/AudioManager';
import { DebugImguiOverlay } from '@game/engine/DebugImguiOverlay/DebugImguiOverlay';
import { FileWatch } from '@game/engine/FileWatch/FileWatch';
import { ResourceManager } from '@game/engine/ResourceManager/ResourceManager';
import { VideoManager } from '@game/engine/VideoManager/VideoManager';
import { AlphaFamilyGameflow } from '@game/integration/AlphaFamilyGameflow/AlphaFamilyGameflow';
import { BrowserKernel, type BrowserKernelConfig } from '@game/integration/BrowserKernel/BrowserKernel';
import { RngPresetManager } from '@game/integration/RngPresetManager/RngPresetManager';
import { AutomationManager } from '@game/integration/AutomationManager/AutomationManager';
import type { GameAssetReport, GameProject, GameProjectModule } from './GameBackend';
import { FAMILY_TOOL_MODULES, GameModuleName, MODULES } from './ModuleRegistry';

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

export class GameApp implements IModuleManager {
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

  /** Whether the browser game has every module of the game's modules config (a game being imported has some only). */
  static CanPlay(project: GameProject) {
    const modules = GameApp.GameModules(project);
    return modules.length > 0 && modules.every(module => module.name in MODULES);
  }

  async Start(options: GameStartOptions) {
    const { project } = options;
    // the module manager, which loads a module while the game runs (the automation's view module)
    this.runtime.Add(IModuleManager, this);
    const capping = GameApp.Capping(project);
    this.Add('ResourceManager', new ResourceManager(project, options.report), {}, true);
    // a view reloads its elements list when its file changes (C++'s FileWatch, in debug and QA builds)
    this.Add('FileWatch', new FileWatch(), {}, true);
    this.Add('VideoManager', new VideoManager(options.canvas, options.infoCanvas ?? null, options.topperCanvas ?? null), {}, true);
    this.Add('AudioManager', new AudioManager(), {}, true);
    // the debug tools' menu bar (C++'s DebugImguiOverlay, of the QA and debug builds' modules config)
    this.Add('DebugImguiOverlay', new DebugImguiOverlay(), {}, true);
    this.Add('BrowserKernel', new BrowserKernel(), { capping, ...options.kernel }, true);
    this.Add('AlphaFamilyGameflow', new AlphaFamilyGameflow(), {}, true);
    // The QA builds' tools (configs/alpha_family/modules/AlphaGameModules_QA.json), in its order: the automation, which
    // plays games with the view module of its stubs, before the RNG Queue, which the RNG tools add to (on a round's
    // start, the automation records the round's numbers before the queue lets its engine go).
    this.Add('AutomationManager', new AutomationManager(), {
      stubViewModule: { name: 'AlphaFamilyAutomationView', space: 'Egt::Game::AlphaFamily', header: 'Egt/AlphaFamilyAutomationView/AlphaFamilyAutomationView.h' },
    }, true);
    this.Add('RngPresetManager', new RngPresetManager(), {}, true);
    // The family's modules (the capping splash...), then the game's. The engine's are made above.
    const engine = new Set(this.modules.map(entry => entry.name));
    for (const module of [...(project.familyModules?.config.modules ?? []), ...GameApp.GameModules(project)]) {
      if (engine.has(module.name)) continue;
      const descriptor = MODULES[module.name];
      if (descriptor) this.Add(module.name, descriptor.create(), module.config ?? {}, false);
      else this.skipped.push(module.name);
    }
    // the family's debug tools, after the game's modules (they read its math rules)
    for (const name of FAMILY_TOOL_MODULES) {
      if (!this.modules.some(entry => entry.name === name) && MODULES[name]) this.Add(name, MODULES[name].create(), {}, false);
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

  ////////////////////////////////////////////////////////////////////////////////
  /// IModuleManager: a module of the registry loaded while the game runs, and unloaded
  ////////////////////////////////////////////////////////////////////////////////

  LoadModule(runtime: Runtime, config: ModuleLoadConfig) {
    const descriptor = MODULES[config.name];
    if (!descriptor || this.IsModuleLoaded(config.name)) return false;
    const module = descriptor.create();
    const loaded = module.Init(runtime, config.config);
    if (loaded instanceof Promise || !loaded || !module.PostInit() || (module.Start && !module.Start())) {
      console.error(`GameApp: loading ${config.name} failed`);
      return false;
    }
    this.Add(config.name, module, config.config, false);
    return true;
  }

  UnloadModule(name: string) {
    const index = this.modules.findIndex(entry => entry.name === name);
    if (index < 0) return;
    const [entry] = this.modules.splice(index, 1);
    entry.module.Stop?.();
    entry.module.PreDeinit();
    entry.module.Deinit();
  }

  IsModuleLoaded(name: string) {
    return this.modules.some(entry => entry.name === name);
  }

  private Add(name: string, module: IModule, config: ModuleConfig, engine: boolean) {
    this.modules.push({ name, module, config, engine });
  }

  Get<T extends IModule>(type: new (...args: never[]) => T): T | null {
    return (this.modules.find(entry => entry.module instanceof type)?.module as T) ?? null;
  }

  /** The game's module of a kind (its <Game>Fsm, <Game>Math, <Game>View, <Game>InfoView), whichever game plays. */
  GetGameModule<T>(kind: 'Fsm' | 'Math' | 'View' | 'InfoView' | 'TopperView'): T | null {
    const name = GameModuleName(this.modules.filter(entry => !entry.engine).map(entry => entry.name), kind);
    return (this.modules.find(entry => entry.name === name)?.module as T | undefined) ?? null;
  }

  /** The playing game's C++ name (BurningCrownTetraSpins10): its state machine module's, without Fsm. */
  GetGameName() {
    return GameModuleName(this.modules.filter(entry => !entry.engine).map(entry => entry.name), 'Fsm')?.replace(/Fsm$/, '') ?? null;
  }

  private Frame = () => {
    if (!this.running) return;
    try {
      // a copy: a module may unload during the frame (the automation's, when its games end)
      for (const entry of [...this.modules]) entry.module.Process();
      for (const entry of [...this.modules]) entry.module.PostProcess();
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
        entry.module.Stop?.();
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
    this.runtime.Remove(IModuleManager);
  }
}
