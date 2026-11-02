// Egt::Game::IDebugOverlay (Egt/Game/RuntimeExport/IDebugOverlay.h): the debug overlay's main menu bar, which the debug
// tools add their items to. In C++ each tool draws its items with ImGui (BeginMainMenuBar, BeginMenu("Tools"),
// MenuItem) when imguiMainMenuBar is posted, every frame, and checks its shortcuts (ImGui::Shortcut) when imguiShortcuts
// is. The Play page's menu is Vue, so the events carry the menu bar and the shortcuts the tools add theirs to, and the
// page posts them when it shows the menu and when a key is pressed.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import { RuntimeCategory } from '../RuntimeCategory';

/** A menu item: ImGui::MenuItem(label, shortcut) in ImGui::BeginMenu(menu), and what its click does. */
export interface MainMenuItem {
  menu: string;
  label: string;
  shortcut: string;
  select: () => void;
}

/** The main menu bar being built: ImGui's BeginMainMenuBar … EndMainMenuBar. */
export class MainMenuBar {
  readonly items: MainMenuItem[] = [];

  /** if (ImGui::BeginMenu(menu)) { if (ImGui::MenuItem(label)) select(); ImGui::EndMenu(); } */
  MenuItem(menu: string, label: string, select: () => void, shortcut = '') {
    this.items.push({ menu, label, shortcut, select });
  }

  /** The items of a menu, in the order the tools added them. */
  Menu(menu: string) {
    return this.items.filter(item => item.menu === menu);
  }
}

/** A keyboard shortcut (ImGui::Shortcut, and its IKeymapInfo line): "Ctrl+A", what it does, its action. */
export interface Shortcut {
  keys: string;
  description: string;
  action: () => void;
}

/** The shortcuts being gathered (imguiShortcuts): each tool's. */
export class Shortcuts {
  readonly items: Shortcut[] = [];

  Shortcut(keys: string, description: string, action: () => void) {
    this.items.push({ keys, description, action });
  }

  /** The shortcut of a key press (Ctrl and a letter), if any. */
  Find(event: { ctrlKey: boolean; key: string }) {
    if (!event.ctrlKey) return null;
    return this.items.find(item => item.keys.toLowerCase() === `ctrl+${event.key.toLowerCase()}`) ?? null;
  }
}

/** The overlay itself: its events are what the tools use. */
export interface IDebugOverlay {}

export class IDebugOverlayEvents {
  static readonly RuntimeCategory = RuntimeCategory.GameDebug;

  readonly imguiMainMenuBar = new Event<[MainMenuBar]>();
  readonly imguiShortcuts = new Event<[Shortcuts]>();
}

export const IDebugOverlay = Interface<IDebugOverlay, IDebugOverlayEvents>('IDebugOverlay');
