// Egt::Game::GameFsm (Egt/Game/Fsm/GameFsm.h): a module that runs the state machine its CreateBuilder describes.

import { Machine, type StateNode } from '@game/engine/Fsm/Fsm';
import { IPause } from '@game/engine/Game/RuntimeImport/IPause';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

export abstract class GameFsm extends BaseModule {
  protected m_machine: Machine | null = null;

  protected abstract CreateBuilder(): StateNode;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    return true;
  }

  /** The machine starts once every module is ready, entering its default states. */
  PostInit() {
    this.m_machine = new Machine(this.CreateBuilder());
    this.m_machine.Init(this.GetRuntime());
    return true;
  }

  Process() {
    // While paused the machine takes no step: events received meanwhile stay queued, in order, until resume.
    // Only this per-frame step waits; an integration that calls ProcessState itself keeps its own timing.
    const pause = this.RuntimeTryGetConst(IPause);
    if (pause && pause.IsPaused()) {
      return;
    }
    this.ProcessState();
  }

  ProcessState() {
    this.m_machine?.Process();
  }

  Deinit() {
    this.m_machine?.Deinit();
    this.m_machine = null;
    super.Deinit();
  }

  GetMachine() {
    return this.m_machine;
  }
}

