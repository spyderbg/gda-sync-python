// Egt::GameVideoCtrl::BaseElement (ViewElements/BaseElement.h): an element of a view, placed as GetTransform places
// it: moved by its alignment and size, scaled and rotated around its pivot, at its position; tinted by its color.

import { Runtime, RuntimeHolder } from '../../GameCore/RuntimeAccess';
import type { Color, Point, RssRect, Size, ViewElementData } from '../../Game/RuntimeExport/IResources';
import type { DrawList, Transform } from '../DrawList';

export enum Alignment {
  None = 'None',
  TopLeft = 'TopLeft',
  TopCenter = 'TopCenter',
  TopRight = 'TopRight',
  MiddleLeft = 'MiddleLeft',
  MiddleCenter = 'MiddleCenter',
  MiddleRight = 'MiddleRight',
  BottomLeft = 'BottomLeft',
  BottomCenter = 'BottomCenter',
  BottomRight = 'BottomRight',
}

// The share of an element's width and height it is moved left and up by (BaseElement::GetAlignmentOffset).
const ALIGNMENT: Record<string, [number, number]> = {
  None: [0, 0], TopLeft: [0, 0], TopCenter: [0.5, 0], TopRight: [1, 0], MiddleLeft: [0, 0.5], MiddleCenter: [0.5, 0.5],
  MiddleRight: [1, 0.5], BottomLeft: [0, 1], BottomCenter: [0.5, 1], BottomRight: [1, 1],
};

export const WHITE: Color = { r: 255, g: 255, b: 255, a: 255 };

export class BaseElement extends RuntimeHolder {
  protected id = '';
  protected key = '';
  protected position: Point = { x: 0, y: 0 };
  protected scale: Point = { x: 1, y: 1 };
  protected rotation = 0;
  protected pivot: Point = { x: 0, y: 0 };
  protected alignment: string = Alignment.None;
  protected color: Color = { ...WHITE };
  protected hidden = false;
  protected elementData: ViewElementData | null = null;

  Init(runtime: Runtime, key = '') {
    this.SetRuntime(runtime);
    this.key = key;
  }

  Deinit() {}

  SetElementData(data: ViewElementData) {
    this.elementData = data;
    if (data.id) this.id = data.id;
    if (data.position) this.position = { x: data.position.x ?? 0, y: data.position.y ?? 0 };
    if (data.scale) this.scale = { x: data.scale.x ?? 1, y: data.scale.y ?? 1 };
    if (data.pivot) this.pivot = { x: data.pivot.x ?? 0, y: data.pivot.y ?? 0 };
    if (typeof data.rotation === 'number') this.rotation = data.rotation;
    if (data.alignment) this.alignment = data.alignment;
    if (data.color) this.color = { ...WHITE, ...data.color };
    if (data.hidden) this.hidden = true;
  }

  Update(_now: number) {}

  Draw(_drawList: DrawList) {}

  IsVisible() {
    return !this.hidden;
  }

  GetKey() {
    return this.key;
  }

  GetId() {
    return this.id;
  }

  SetId(id: string) {
    this.id = id;
    return this;
  }

  GetPosition() {
    return { ...this.position };
  }

  SetPosition(position: Point) {
    this.position = { x: position.x, y: position.y };
    return this;
  }

  GetScale() {
    return { ...this.scale };
  }

  SetScale(scale: Point | undefined) {
    if (scale) this.scale = { x: scale.x, y: scale.y };
    return this;
  }

  GetRotation() {
    return this.rotation;
  }

  SetRotation(degrees: number) {
    this.rotation = degrees;
    return this;
  }

  GetPivot() {
    return { ...this.pivot };
  }

  SetPivot(pivot: Point) {
    this.pivot = { ...pivot };
    return this;
  }

  /** The element's data in its view, which says which of its values the view sets. */
  GetElementData(): ViewElementData {
    return this.elementData ?? { type: '' };
  }

  /** The point it scales and rotates around, in the view. */
  GetWorldPivot(): Point {
    return { x: this.position.x + this.pivot.x, y: this.position.y + this.pivot.y };
  }

  SetWorldPivot(pivot: Point) {
    this.pivot = { x: pivot.x - this.position.x, y: pivot.y - this.position.y };
    return this;
  }

  SetAlignment(alignment: Alignment | string) {
    this.alignment = alignment;
    return this;
  }

  GetSize(): Size {
    return { w: 0, h: 0 };
  }

  /** The area the element covers, without its rotation. */
  GetBounds(): RssRect {
    const size = this.GetSize();
    const [ax, ay] = ALIGNMENT[this.alignment] ?? [0, 0];
    const w = size.w * this.scale.x;
    const h = size.h * this.scale.y;
    return { x: this.position.x - ax * w, y: this.position.y - ay * h, w, h };
  }

  GetColor() {
    return { ...this.color };
  }

  SetColor(color: Partial<Color>) {
    this.color = { ...this.color, ...color };
    return this;
  }

  SetAlpha(alpha: number) {
    this.color = { ...this.color, a: alpha };
    return this;
  }

  GetHidden() {
    return this.hidden;
  }

  SetHidden(hidden: boolean) {
    this.hidden = hidden;
    return this;
  }

  /** Places another element where a Dummy element is (SetFromDummy; C++ takes its pointer, which may be null). */
  SetFromDummy(dummy: BaseElement | null) {
    if (!dummy) return this;
    this.position = dummy.GetPosition();
    this.scale = dummy.GetScale();
    this.rotation = dummy.GetRotation();
    return this;
  }

  GetTransform(): Transform {
    const [alignX, alignY] = ALIGNMENT[this.alignment] ?? [0, 0];
    return {
      x: this.position.x, y: this.position.y, scaleX: this.scale.x, scaleY: this.scale.y, rotation: this.rotation,
      pivotX: this.pivot.x, pivotY: this.pivot.y, alignX, alignY,
    };
  }

  HandleTouchDown(_point: Point) {
    return false;
  }

  HandleTouchUp(_point: Point) {
    return false;
  }

  OnLanguageChanged(_language: string) {}
}
