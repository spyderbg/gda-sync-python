// Egt::GameVideoCtrl::ButtonElement (ViewElements/ButtonElement.h): an image for each state (rssKeys: idle, pressed,
// disabled) and the area that takes touches (touchArea, else the image).

import type { Point, RssRect, ViewElementData } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { DrawList } from '../DrawList';
import { IVideo } from '../RuntimeExport/IVideo';
import { BaseElement } from './BaseElement';

export enum EButtonState {
  Idle,
  Pressed,
  Disabled,
}

const TOUCH_AREA_KEYS = ['DUMMY_AREA'];

export class ButtonElement extends BaseElement {
  protected images: string[] = [];
  protected touchArea: RssRect | null = null;
  protected enabled = true;
  protected pressed = false;
  protected pressedSound = '';

  SetElementData(data: ViewElementData) {
    super.SetElementData(data);
    this.images = data.rssKeys ?? (data.rssKey ? [data.rssKey] : []);
    if (data.touchArea) this.touchArea = { ...data.touchArea };
    this.pressedSound = data.rssKeySound ?? '';
  }

  SetPressedSound(rssKey: string) {
    this.pressedSound = rssKey;
    return this;
  }

  SetIdleImage(rssKey: string) {
    this.images[EButtonState.Idle] = rssKey;
    return this;
  }

  SetPressedImage(rssKey: string) {
    this.images[EButtonState.Pressed] = rssKey;
    return this;
  }

  SetDisabledImage(rssKey: string) {
    this.images[EButtonState.Disabled] = rssKey;
    return this;
  }

  SetEnabled(enabled: boolean) {
    this.enabled = enabled;
    if (!enabled) this.pressed = false;
    return this;
  }

  IsEnabled() {
    return this.enabled;
  }

  IsPressed() {
    return this.pressed;
  }

  GetTouchArea(): RssRect {
    const bounds = this.GetBounds();
    return this.touchArea ? { x: bounds.x + this.touchArea.x, y: bounds.y + this.touchArea.y, w: this.touchArea.w, h: this.touchArea.h } : bounds;
  }

  /** The index of the image of the button's state. */
  protected ImageIndex(): number {
    return !this.enabled ? EButtonState.Disabled : this.pressed ? EButtonState.Pressed : EButtonState.Idle;
  }

  private CurrentImage() {
    const key = this.images[this.ImageIndex()] ?? this.images[0];
    if (!key || TOUCH_AREA_KEYS.includes(key)) return null;
    const entry = this.RuntimeGet(IResources).GetImage(key);
    if (!entry) return null;
    const image = this.RuntimeGet(IVideo).GetImages().Get(entry.file);
    return image ? { image, source: entry.source ?? null } : null;
  }

  GetSize() {
    const current = this.CurrentImage();
    if (!current) return this.touchArea ? { w: this.touchArea.w, h: this.touchArea.h } : { w: 0, h: 0 };
    return current.source ? { w: current.source.w, h: current.source.h } : { w: current.image.naturalWidth, h: current.image.naturalHeight };
  }

  protected PlayPressedSound() {
    if (this.pressedSound) this.RuntimeTryGet(IAudioApi)?.Play(this.pressedSound);
  }

  protected Contains(point: Point) {
    const area = this.GetTouchArea();
    return point.x >= area.x && point.x <= area.x + area.w && point.y >= area.y && point.y <= area.y + area.h;
  }

  // the button reacts on the touch down; it shows pressed until the touch up
  HandleTouchDown(point: Point) {
    if (this.hidden || !this.enabled || this.pressed || !this.Contains(point)) return false;
    this.pressed = true;
    this.PlayPressedSound();
    return true;
  }

  HandleTouchUp(point: Point) {
    if (!this.pressed) return false;
    this.pressed = false;
    return !this.hidden && this.enabled && this.Contains(point);
  }

  Draw(drawList: DrawList) {
    if (this.hidden) return;
    const current = this.CurrentImage();
    if (!current) return;
    const size = this.GetSize();
    drawList.DrawImage(current.image, current.source, this.GetTransform(), size.w, size.h, this.color);
  }
}
