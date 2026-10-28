// Egt::GameVideoCtrl::ElementsList (ViewElements/ElementsList.h): the elements of a view, loaded from its
// ElementsList entry (RssElementsListData.json -> v/<resolution>/<View>.json), and those the view creates at runtime.
// It watches its file (IFileWatch): when the file changes, it is dirty, and its view loads it again (BaseView): in
// place when the file has the same elements (Update), else anew.

import { Runtime, RuntimeHolder } from '@game/engine/GameCore/RuntimeAccess';
import type { Color, Point, ViewElementData } from '@game/engine/Game/RuntimeExport/IResources';
import { IFileWatch } from '@game/engine/Game/RuntimeExport/IFileWatch';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '../DrawList';
import { AnimElement } from './AnimElement';
import { BaseElement } from './BaseElement';
import { ButtonElement } from './ButtonElement';
import { ToggleButtonElement } from './ToggleButtonElement';
import { ImageElement } from './ImageElement';
import { RtfElement } from './RtfElement';
import { TextElement } from './TextElement';

type ElementClass<T extends BaseElement> = new () => T;

/** The element class of a view element's type; Dummy and the others place nothing more than a BaseElement. */
const TYPES: Record<string, ElementClass<BaseElement>> = {
  Image: ImageElement, Anim: AnimElement, Text: TextElement, Button: ButtonElement, ToggleButton: ToggleButtonElement, Rtf: RtfElement,
};

export class ElementsList extends RuntimeHolder {
  private elements: BaseElement[] = [];
  /** The elements loaded from the file, in its order. */
  private loadedElements: BaseElement[] = [];
  private readonly byId = new Map<string, BaseElement>();
  private lastId = 0;
  private loaded = false;
  private hidden = false;
  private elementsListId = '';
  private onLoaded: (() => void) | null = null;
  private filepath = '';
  private watchedFilepath = '';
  private isDirty = false;
  private isDirtyInternal = false;
  private dirtyCheckTime = 0;

  Init(runtime: Runtime, elementsListId: string) {
    this.SetRuntime(runtime);
    this.elementsListId = elementsListId;
  }

  Deinit() {
    this.UnwatchFile();
    this.onLoaded = null;
    this.RemoveAll();
    this.loaded = false;
  }

  SetOnElementsListLoadedCallback(callback: (() => void) | null) {
    this.onLoaded = callback;
  }

  /** Loads the view's elements; the elements created at runtime stay. */
  LoadFromResource() {
    const data = this.elementsListId ? this.RuntimeGet(IResources).GetElementsList(this.elementsListId) : null;
    this.loadedElements = (data?.elements ?? []).map(item => this.Add(item));
    this.isDirty = false;
    this.loaded = true;
    this.onLoaded?.();
    this.filepath = this.elementsListId ? this.RuntimeGet(IResources).GetElementsListFile(this.elementsListId) ?? '' : '';
    this.WatchFile();
    return data !== null;
  }

  private WatchFile() {
    if (this.filepath === this.watchedFilepath) return;
    this.UnwatchFile();
    if (!this.filepath) return;
    const fileWatch = this.RuntimeTryGet(IFileWatch);
    if (fileWatch) {
      fileWatch.StartWatchFile(this.filepath);
      this.watchedFilepath = this.filepath;
    }
  }

  private UnwatchFile() {
    if (!this.watchedFilepath) return;
    this.RuntimeTryGet(IFileWatch)?.StopWatchFile(this.watchedFilepath);
    this.watchedFilepath = '';
  }

  IsLoaded() {
    return this.loaded;
  }

  /** Gives the loaded elements their changed file's data, when it has the same elements (by id, type and keys), such
   * as when they moved, and runs the view's callback again, which places what it derives from them (from dummies, its
   * tweens): the view keeps its elements and those it created; false, and nothing changes, if not. */
  UpdateFromResource() {
    const data = this.elementsListId ? this.RuntimeGet(IResources).GetElementsList(this.elementsListId) : null;
    const items = data?.elements ?? [];
    const same = (item: ViewElementData, known: ViewElementData) => item.id === known.id && item.type === known.type
      && item.rssKey === known.rssKey && JSON.stringify(item.rssKeys ?? null) === JSON.stringify(known.rssKeys ?? null);
    if (!this.loaded || items.length !== this.loadedElements.length) return false;
    if (!items.every((item, i) => same(item, this.loadedElements[i].GetElementData()))) return false;
    items.forEach((item, i) => this.loadedElements[i].SetElementData(item));
    this.isDirty = false;
    this.onLoaded?.();
    return true;
  }

  /** Whether its file changed since it was loaded. */
  IsDirty() {
    return this.isDirty;
  }

  HandleFileChanged(filepath: string) {
    if (filepath !== this.filepath) return;
    this.isDirtyInternal = true;
  }

  private Add(item: ViewElementData) {
    const Type = TYPES[item.type] ?? BaseElement;
    const element = new Type();
    element.Init(this.GetRuntime(), item.rssKey ?? '');
    element.SetId(String(this.lastId++));
    element.SetElementData(item);
    if (item.type === 'Dummy') element.SetHidden(true);
    this.elements.push(element);
    this.byId.set(element.GetId(), element);
    return element;
  }

  /** Create, of an element C++ holds by its shared pointer (CreatePtr<T>), such as to tween it. */
  CreatePtr<T extends BaseElement>(Type: ElementClass<T>, key = ''): T {
    return this.Create(Type, key);
  }

  Create<T extends BaseElement>(Type: ElementClass<T>, key = ''): T {
    const element = new Type();
    element.Init(this.GetRuntime(), key);
    element.SetId(String(this.lastId++));
    this.elements.push(element);
    this.byId.set(element.GetId(), element);
    return element;
  }

  Get<T extends BaseElement = BaseElement>(id: string, Type?: ElementClass<T>): T {
    const element = this.byId.get(id);
    if (!element) throw new Error(`${this.elementsListId}: no element ${id}`);
    if (Type && !(element instanceof Type)) throw new Error(`${this.elementsListId}: element ${id} is not a ${Type.name}`);
    return element as T;
  }

  TryGet<T extends BaseElement = BaseElement>(id: string, Type?: ElementClass<T>): T | null {
    const element = this.byId.get(id);
    return element && (!Type || element instanceof Type) ? (element as T) : null;
  }

  Find<T extends BaseElement = BaseElement>(id: string, Type?: ElementClass<T>): T | null {
    return this.TryGet(id, Type);
  }

  Remove(ids: string | Iterable<string>) {
    const list = typeof ids === 'string' ? [ids] : [...ids];
    let removed = false;
    for (const id of list) {
      const element = this.byId.get(id);
      if (!element) continue;
      element.Deinit();
      element.Release();
      this.byId.delete(id);
      this.elements = this.elements.filter(item => item !== element);
      this.loadedElements = this.loadedElements.filter(item => item !== element);
      removed = true;
    }
    return removed;
  }

  RemoveAll() {
    for (const element of this.elements) {
      element.Deinit();
      element.Release();
    }
    this.elements = [];
    this.loadedElements = [];
    this.byId.clear();
  }

  SetPosition(position: Point, ids: string | Iterable<string>) {
    for (const id of typeof ids === 'string' ? [ids] : ids) this.byId.get(id)?.SetPosition(position);
  }

  SetRotation(degrees: number, ids: Iterable<string>) {
    for (const id of ids) this.byId.get(id)?.SetRotation(degrees);
  }

  SetWorldPivot(pivot: Point, ids: Iterable<string>) {
    for (const id of ids) this.byId.get(id)?.SetWorldPivot(pivot);
  }

  SetColor(color: Partial<Color>, ids: Iterable<string>) {
    for (const id of ids) this.byId.get(id)?.SetColor(color);
  }

  SetAlpha(alpha: number, ids: Iterable<string>) {
    for (const id of ids) this.byId.get(id)?.SetAlpha(alpha);
  }

  /** Hides or shows the elements of the ids, or, without ids, the list itself (as C++, where the list is an element). */
  SetHidden(hidden: boolean, ids?: Iterable<string>) {
    if (!ids) {
      this.hidden = hidden;
      return;
    }
    for (const id of ids) this.byId.get(id)?.SetHidden(hidden);
  }

  IsVisible() {
    return !this.hidden;
  }

  GetElements(): readonly BaseElement[] {
    return this.elements;
  }

  Update(now = performance.now()) {
    for (const element of this.elements) element.Update(now);
    // update elements list dirty flag; it stays dirty until loaded, so that a hidden view loads it when it shows
    if (now > this.dirtyCheckTime) {
      this.dirtyCheckTime = now + 100;
      this.isDirty ||= this.isDirtyInternal;
      this.isDirtyInternal = false;
    }
  }

  Draw(drawList: DrawList) {
    if (this.hidden) return;
    for (const element of this.elements) element.Draw(drawList);
  }

  HandleTouchDown(point: Point) {
    return [...this.elements].reverse().some(element => element.HandleTouchDown(point));
  }

  HandleTouchUp(point: Point) {
    let handled = false;
    for (const element of [...this.elements].reverse()) handled = element.HandleTouchUp(point) || handled;
    return handled;
  }

  OnLanguageChanged(language: string) {
    for (const element of this.elements) element.OnLanguageChanged(language);
  }
}
