// Egt::Game::AlphaFamily::Stub::StubView<Interface> (AlphaFamilyAutomationView/Components/StubView.h): a stub of a view
// interface, which takes the interface's place in the runtime while it is initialized (the game's states then call
// it, not the view) and puts the view back when it is deinitialized; it posts the interface's events, the view's.
// C++ takes the interface as a template parameter; here, its token.

import type { InterfaceToken, Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { IStubView } from './IStubView';

export abstract class StubView<Interface, Events> implements IStubView {
  protected m_interface: Interface | null = null;
  protected m_events: Events | null = null;

  constructor(protected readonly token: InterfaceToken<Interface, Events>) {}

  Init(runtime: Runtime) {
    if (runtime.TryGet(this.token) === undefined) return false;
    // Overwirte implementation
    this.m_interface = runtime.Overwrite(this.token, this as unknown as Interface) ?? null;
    this.m_events = runtime.TryGet(this.token.Events) ?? null;
    return true;
  }

  Deinit(runtime: Runtime) {
    if (this.m_interface === null) return;
    // Restore implementation
    runtime.Overwrite(this.token, this.m_interface);
    this.m_interface = null;
    this.m_events = null;
  }
}
