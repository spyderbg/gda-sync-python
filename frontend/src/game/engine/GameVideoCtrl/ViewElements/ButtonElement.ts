// Egt::GameVideoCtrl::ButtonElement (ViewElements/ButtonElement.h/.cpp): an image for each state (rssKeys: idle, pressed,
// disabled) and the area that takes touches (touchArea, else the image). A touch down presses an idle button: it shows
// pressed for 210 ms of the game Clock (m_timerPressed), whatever the touch up does, and takes no other touch until
// then. A button whose idle key is no image (an area element) only says whether the point is in its area.

import type { Point, RssRect, ViewElementData } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
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
  private m_state = EButtonState.Idle;
  private readonly m_timerPressed = new Stopwatch();
  protected pressedSound = '';

  Init(runtime: Runtime, key = '') {
    super.Init(runtime, key);

    this.m_timerPressed.Reset();
    this.m_timerPressed.Pause();
  }

  Deinit() {
    this.m_timerPressed.Reset();
    super.Deinit();
  }

  Update(now: number) {
    if (this.m_state === EButtonState.Pressed && this.m_timerPressed.Measure() > 210) {
      this.m_timerPressed.Reset();
      this.m_timerPressed.Pause();
      this.RefreshState();
    }
    super.Update(now);
  }

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

    this.RefreshState();

    return this;
  }

  IsEnabled() {
    return this.enabled;
  }

  GetPressedDuration() {
    return this.m_timerPressed.Measure();
  }

  private RefreshState() {
    if (this.m_timerPressed.IsRunning()) return;

    this.m_state = this.enabled === false ? EButtonState.Disabled : EButtonState.Idle;
  }

  GetTouchArea(): RssRect {
    const bounds = this.GetBounds();
    return this.touchArea ? { x: bounds.x + this.touchArea.x, y: bounds.y + this.touchArea.y, w: this.touchArea.w, h: this.touchArea.h } : bounds;
  }

  /** The index of the image of the button's state. */
  protected ImageIndex(): number {
    return this.m_state;
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

  /** Whether the button has no idle image: an area that takes touches. */
  protected IsAreaElement() {
    const key = this.images[EButtonState.Idle];
    return !key || TOUCH_AREA_KEYS.includes(key) || !this.RuntimeGet(IResources).GetImage(key);
  }

  HandleTouchDown(point: Point) {
    if (!(this.IsVisible() && this.enabled)) return false;
    if (this.m_state !== EButtonState.Idle) return false;
    const prevState = this.m_state;

    if (this.IsAreaElement()) {
      return this.Contains(point);
    } else if (this.Contains(point)) {
      this.m_timerPressed.Reset();
      this.m_state = EButtonState.Pressed;
      this.PlayPressedSound();
    } else {
      this.m_state = EButtonState.Idle;
    }

    return this.m_state !== prevState;
  }

  HandleTouchUp(point: Point) {
    if (this.m_state !== EButtonState.Pressed) return false;

    if (this.IsAreaElement()) {
      return this.Contains(point);
    } else if (this.Contains(point)) {
      // the button reacts on the button touch down
      return true;
    }

    return false;
  }

  Draw(drawList: DrawList) {
    if (this.hidden) return;
    const current = this.CurrentImage();
    if (!current) return;
    const size = this.GetSize();
    drawList.DrawImage(current.image, current.source, this.GetTransform(), size.w, size.h, this.color);
  }
}
