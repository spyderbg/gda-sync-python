// Egt::GameVideoCtrl::ElementsList (ViewElements/ElementsList.h): the elements of a view, loaded from its
// ElementsList entry (RssElementsListData.json -> v/<resolution>/<View>.json), and those the view creates at runtime.

import { Runtime, RuntimeHolder } from '../../GameCore/RuntimeAccess';
import type { Point, ViewElementData } from '../../Game/RuntimeExport/IResources';
import { IResources } from '../../Game/RuntimeExport/IResources';
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
  private readonly byId = new Map<string, BaseElement>();
  private lastId = 0;
  private loaded = false;
  private hidden = false;
  private elementsListId = '';
  private onLoaded: (() => void) | null = null;

  Init(runtime: Runtime, elementsListId: string) {
    this.SetRuntime(runtime);
    this.elementsListId = elementsListId;
  }

  Deinit() {
    this.RemoveAll();
    this.loaded = false;
  }

  SetOnElementsListLoadedCallback(callback: (() => void) | null) {
    this.onLoaded = callback;
  }

  /** Loads the view's elements; the elements created at runtime stay. */
  LoadFromResource() {
    const data = this.elementsListId ? this.RuntimeGet(IResources).GetElementsList(this.elementsListId) : null;
    for (const item of data?.elements ?? []) this.Add(item);
    this.loaded = true;
    this.onLoaded?.();
    return data !== null;
  }

  IsLoaded() {
    return this.loaded;
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
      this.byId.delete(id);
      this.elements = this.elements.filter(item => item !== element);
      removed = true;
    }
    return removed;
  }

  RemoveAll() {
    for (const element of this.elements) element.Deinit();
    this.elements = [];
    this.byId.clear();
  }

  SetPosition(position: Point, ids: string | Iterable<string>) {
    for (const id of typeof ids === 'string' ? [ids] : ids) this.byId.get(id)?.SetPosition(position);
  }

  SetWorldPivot(pivot: Point, ids: Iterable<string>) {
    for (const id of ids) this.byId.get(id)?.SetWorldPivot(pivot);
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

  Elements(): readonly BaseElement[] {
    return this.elements;
  }

  Update(now: number) {
    for (const element of this.elements) element.Update(now);
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
