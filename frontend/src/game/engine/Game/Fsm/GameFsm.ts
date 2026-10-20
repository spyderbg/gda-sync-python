// Egt::Game::GameFsm (Egt/Game/Fsm/GameFsm.h): a module that runs the state machine its CreateBuilder describes.

import { Machine, type StateNode } from '../../Fsm/Fsm';
import type { Runtime } from '../../GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '../../ModuleManager/BaseModule';

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

