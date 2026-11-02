// Egt::Game::DebugImguiOverlay (Egt/DebugImguiOverlay/DebugImguiOverlay.h, a module of the QA and debug builds): the
// debug overlay. In C++ it draws ImGui over the game, and every module's ImGuiDraw draws its windows there. In the
// browser the Play page draws the tools' windows in Vue; the overlay provides IDebugOverlay, whose main menu bar the
// page builds when it shows its Tools menu (GetMainMenuBar).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IDebugOverlay, IDebugOverlayEvents, MainMenuBar, Shortcuts } from '@game/engine/Game/RuntimeExport/IDebugOverlay';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

export class DebugImguiOverlay extends BaseModule implements IDebugOverlay {
  private readonly m_events = new IDebugOverlayEvents();

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    this.RuntimeAdd(IDebugOverlay, this);
    this.RuntimeAdd(IDebugOverlay.Events, this.m_events);

    return true;
  }

  Deinit() {
    this.RuntimeRemove(IDebugOverlay);
    this.RuntimeRemove(IDebugOverlay.Events);

    super.Deinit();
  }

  /** The tools' keyboard shortcuts (C++ checks them every frame: its imguiShortcuts). */
  GetShortcuts() {
    const shortcuts = new Shortcuts();
    this.m_events.imguiShortcuts.Post(shortcuts);
    return shortcuts;
  }

  /** The main menu bar the tools add their items to (C++ draws it every frame: its imguiMainMenuBar). */
  GetMainMenuBar() {
    const menuBar = new MainMenuBar();
    this.m_events.imguiMainMenuBar.Post(menuBar);
    return menuBar;
  }
}
