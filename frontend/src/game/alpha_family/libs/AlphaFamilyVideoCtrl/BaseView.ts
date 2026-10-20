// Egt::Game::AlphaFamily::BaseView (AlphaFamilyVideoCtrl/BaseView.h/.cpp): a view of the game, with its elements
// list, its control state (enabled, visible, focused, skin) and the touches it takes.

import { RuntimeHolder, type Runtime } from '../../../engine/GameCore/RuntimeAccess';
import { Timers } from '../../../engine/GameCore/Tools/Timers';
import type { DrawList } from '../../../engine/GameVideoCtrl/DrawList';
import { ElementsList } from '../../../engine/GameVideoCtrl/ViewElements/ElementsList';
import { ControlView } from './Components/ControlView';

export abstract class BaseView extends RuntimeHolder {
  protected m_elementsListId = '';
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
    const now = performance.now();
    this.m_timers.Process(now);
    this.m_elementsList.Update(now);
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    this.m_elementsList.Draw(drawList);
  }

  InitElementsList(elementsListId: string, callback: (() => void) | null = null) {
    this.m_elementsListId = elementsListId;
    this.m_elementsList.Init(this.GetRuntime(), elementsListId);
    this.m_elementsList.SetOnElementsListLoadedCallback(callback);
    this.m_elementsList.LoadFromResource();
  }

  DeinitElementsList() {
    this.m_elementsList.Deinit();
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
