// Egt::Game::AlphaFamily::Stub::IStubView (AlphaFamilyAutomationView/Components/IStubView.h): a stub of a view the
// automation puts in the runtime in place of the game's view, and takes out again. Its SetTheme does nothing: C++'s
// body is in StubView here, as a TypeScript interface has none.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { IThemeView } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';

export interface IStubView extends IThemeView {
  Init(runtime: Runtime): boolean;
  Deinit(runtime: Runtime): void;
}
