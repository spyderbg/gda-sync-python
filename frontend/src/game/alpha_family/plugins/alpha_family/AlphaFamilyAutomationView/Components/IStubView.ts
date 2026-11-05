// Egt::Game::AlphaFamily::Stub::IStubView (AlphaFamilyAutomationView/Components/IStubView.h): a stub of a view the
// automation puts in the runtime in place of the game's view, and takes out again.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';

export interface IStubView {
  Init(runtime: Runtime): boolean;
  Deinit(runtime: Runtime): void;
}
