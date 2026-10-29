// Egt::Game::AlphaFamily::BaseView (AlphaFamilyVideoCtrl/BaseView.h/.cpp): a view of the game, with its elements
// list, its control state (enabled, visible, focused, skin) and the touches it takes. When the file of its elements
// list changes (HandleFileChanged), it loads the list again while it is visible; when the file of a config it watches
// changes (WatchConfig, the browser game's), it calls the view back.

import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { RuntimeHolder, type Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Timers } from '@game/engine/GameCore/Tools/Timers';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ElementsList } from '@game/engine/GameVideoCtrl/ViewElements/ElementsList';
import { ControlView } from './Components/ControlView';

export abstract class BaseView extends RuntimeHolder {
  protected m_elementsListId = '';
  /** The view's callback for its loaded elements list, which runs again when the list reloads (C++ does not). */
  private m_onElementsListLoaded: (() => void) | null = null;
  protected readonly m_elementsList = new ElementsList();
  protected readonly m_control = new ControlView();
  /** The view's delayed actions (tweeny in C++). */
  protected readonly m_timers = new Timers();
  /** The IData of the view's configs it watches (WatchConfig), with their files and callbacks. */
  private readonly m_watchedConfigs: { idataId: string; file: string | null; changed: boolean; onChanged: () => boolean | void }[] = [];

  constructor(protected readonly m_name: string) {
    super();
  }

  Init(runtime: Runtime): boolean {
    this.SetRuntime(runtime);
    return true;
  }

  Deinit() {
    this.m_timers.CancelAll();
    this.m_watchedConfigs.length = 0;
    this.SetRuntime(null);
  }

  Process() {
    if (this.m_elementsList.IsDirty()) this.ReloadElementsList();
    for (const config of this.m_watchedConfigs) {
      if (config.changed && config.onChanged() !== false) config.changed = false;
    }
    const now = performance.now();
    this.m_timers.Process(now);
    this.m_elementsList.Update(now);
  }

  IsOpaqueFullScreen() {
    return false;
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    this.m_elementsList.Draw(drawList);
  }

  InitElementsList(elementsListId: string, callback: (() => void) | null = null) {
    this.m_elementsListId = elementsListId;
    this.m_elementsList.Init(this.GetRuntime(), elementsListId);
    this.m_onElementsListLoaded = callback;
    this.m_elementsList.SetOnElementsListLoadedCallback(callback);
    this.m_elementsList.LoadFromResource();
  }

  /** Loads the elements list again, from its changed file. Elements that only changed (moved, recolored...) change in
   * place, so that the view keeps the elements it holds and creates (the browser game's; C++ makes them anew); else
   * they are made anew. Either way the browser game runs the view's callback again (C++ does not), which places what
   * the view derives from them, such as from dummies, and makes its tweens of them. */
  ReloadElementsList() {
    if (!this.IsVisible()) return;
    if (this.m_elementsList.UpdateFromResource()) return;
    this.m_elementsList.Deinit();
    this.m_elementsList.Init(this.GetRuntime(), this.m_elementsListId);
    this.m_elementsList.SetOnElementsListLoadedCallback(this.m_onElementsListLoaded);
    this.m_elementsList.LoadFromResource();
  }

  DeinitElementsList() {
    this.m_elementsList.Deinit();
  }

  HandleFileChanged(filepath: string) {
    this.m_elementsList.HandleFileChanged(filepath);
    for (const config of this.m_watchedConfigs) {
      const file = this.RuntimeGet(IResources).GetIDataFile(config.idataId);
      if (file === filepath || file !== config.file) config.changed = true;
      config.file = file;
    }
  }

  /** Calls the view back, on its next Process, when the file of the IData of one of its configs changed, or the
   * descriptors name another file for it: the resource manager has read it by then, into the IData's object (in place),
   * and the view reads its config again and makes again what it made from it. The callback returns false to be called
   * again on the next Process, while what it would make again is busy (its reels spin, a page slides in). The browser
   * game's (C++ reads a view's config once): call it in BrowserOnly(...). */
  WatchConfig(idataId: string, onChanged: () => boolean | void) {
    this.m_watchedConfigs.push({ idataId, file: this.RuntimeGet(IResources).GetIDataFile(idataId), changed: false, onChanged });
  }

  HandleTouchDown(_x: number, _y: number) {
    return false;
  }

  HandleTouchUp(_x: number, _y: number) {
    return false;
  }

  OnLanguageChanged(language: string) {
    this.m_elementsList.OnLanguageChanged(language);
  }

  GetName() {
    return this.m_name;
  }

  IsEnabled() {
    return this.m_control.m_enabled;
  }

  SetEnabled(enabled: boolean) {
    this.m_control.SetEnabled(enabled);
  }

  IsVisible() {
    return this.m_control.m_visible;
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
  }

  IsFocused() {
    return this.m_control.m_focused;
  }

  SetFocused(focused: boolean) {
    this.m_control.SetFocused(focused);
  }

  SetSkin(skin: string) {
    this.m_control.SetSkin(skin);
  }
}
