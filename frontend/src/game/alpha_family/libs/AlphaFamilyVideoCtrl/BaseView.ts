// Egt::Game::AlphaFamily::BaseView (AlphaFamilyVideoCtrl/BaseView.h/.cpp): a view of the game, with its elements
// list, its control state (enabled, visible, focused, skin) and the touches it takes. When the file of its elements
// list changes (HandleFileChanged), it loads the list again while it is visible.

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

  constructor(protected readonly m_name: string) {
    super();
  }

  Init(runtime: Runtime): boolean {
    this.SetRuntime(runtime);
    return true;
  }

  Deinit() {
    this.m_timers.CancelAll();
    this.SetRuntime(null);
  }

  Process() {
    if (this.m_elementsList.IsDirty()) this.ReloadElementsList();
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
