// Egt::GameVideoCtrl::ButtonElement (ViewElements/ButtonElement.h/.cpp): an image for each state (rssKeys: idle, pressed,
// disabled) and the area that takes touches. A touch down presses an idle button: it shows pressed for 210 ms of the
// game Clock (m_timerPressed), whatever the touch up does, and takes no other touch until then. A button whose idle key
// is no image (an area element) only says whether the point is in its area.
//
// The area (touchAreaType: Rectangle, Circle or Ellipse) is the data's touchArea, an offset from the element's position
// that moves with it, whatever its alignment, scale, pivot or rotation. Without one, the area is the image as Draw last
// drew it (m_bounds): its top left and bottom right corners, transformed.

import type { Point, RssRect, ViewElementData } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Stopwatch } from '@game/engine/GameCore/Tools/Timers';
import { type DrawList, TransformCoord } from '../DrawList';
import { IVideo } from '../RuntimeExport/IVideo';
import { BaseElement } from './BaseElement';

export enum EButtonState {
  Idle,
  Pressed,
  Disabled,
}

/** Egt::Game::AreaType (ViewElements/Elements.data.h): how a button's touch area takes touches. */
export enum AreaType {
  None = 'None',
  Rectangle = 'Rectangle',
  Circle = 'Circle',
  Ellipse = 'Ellipse',
}

const TOUCH_AREA_KEYS = ['DUMMY_AREA'];

/** video_ctrl::rect::contains: its edges are in it; a negative width or height spans back from its corner. */
function RectContains(rect: RssRect, point: Point) {
  let left = rect.x;
  let right = rect.x + rect.w;
  let top = rect.y;
  let bottom = rect.y + rect.h;
  if (rect.w < 0) {
    [left, right] = [right, left];
  }
  if (rect.h < 0) {
    [top, bottom] = [bottom, top];
  }

  return point.x >= left && point.x <= right && point.y >= top && point.y <= bottom;
}

export class ButtonElement extends BaseElement {
  protected images: string[] = [];
  protected enabled = true;
  private m_bounds: RssRect = { x: 0, y: 0, w: 0, h: 0 };
  private m_touchAreaType = AreaType.None;
  /** The touch area, from the element's position. */
  private m_touchArea: RssRect = { x: 0, y: 0, w: 0, h: 0 };
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
    this.pressedSound = data.rssKeySound ?? '';

    if (data.touchAreaType !== undefined) {
      this.SetAreaType(data.touchAreaType as AreaType);
    }
    if (data.touchArea !== undefined) {
      // C++ sets an element's data before its position (ElementsList::Load): SetTouchArea takes the data's area as the
      // offset from the position. Here the position is set already.
      const position = this.GetPosition();
      this.SetTouchArea({
        x: Math.trunc(data.touchArea.x) + Math.trunc(position.x), y: Math.trunc(data.touchArea.y) + Math.trunc(position.y),
        w: Math.trunc(data.touchArea.w), h: Math.trunc(data.touchArea.h),
      });
    }
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

  GetAreaType() {
    return this.m_touchAreaType;
  }

  SetAreaType(areaType: AreaType) {
    this.m_touchAreaType = areaType;
    return this;
  }

  GetTouchArea(): RssRect {
    const position = this.GetPosition();
    return {
      x: this.m_touchArea.x + Math.trunc(position.x),
      y: this.m_touchArea.y + Math.trunc(position.y),
      w: this.m_touchArea.w,
      h: this.m_touchArea.h,
    };
  }

  SetTouchArea(touchArea: RssRect) {
    const position = this.GetPosition();
    this.m_touchArea = {
      x: touchArea.x - Math.trunc(position.x),
      y: touchArea.y - Math.trunc(position.y),
      w: touchArea.w,
      h: touchArea.h,
    };

    if (this.GetAreaType() === AreaType.None) {
      this.SetAreaType(AreaType.Rectangle);
    }
    return this;
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
    if (!current) return this.m_touchAreaType !== AreaType.None ? { w: this.m_touchArea.w, h: this.m_touchArea.h } : { w: 0, h: 0 };
    return current.source ? { w: current.source.w, h: current.source.h } : { w: current.image.naturalWidth, h: current.image.naturalHeight };
  }

  protected PlayPressedSound() {
    if (this.pressedSound) this.RuntimeTryGet(IAudioApi)?.Play(this.pressedSound);
  }

  protected IsPointInArea(point: Point) {
    switch (this.m_touchAreaType) {
      case AreaType.None: {
        return RectContains(this.m_bounds, point);
      }

      case AreaType.Rectangle: {
        return RectContains(this.GetTouchArea(), point);
      }

      case AreaType.Circle: {
        const rect = this.GetTouchArea();
        const r = Math.trunc(rect.w / 2);
        const dx = point.x - rect.x - r;
        const dy = point.y - rect.y - r;
        return dx * dx + dy * dy <= r * r;
      }

      case AreaType.Ellipse: {
        const rect = this.GetTouchArea();
        const rx = Math.trunc(rect.w / 2);
        const ry = Math.trunc(rect.h / 2);
        const dx = point.x - rect.x - rx;
        const dy = point.y - rect.y - ry;
        // C++'s int arithmetic, as it is written: ((dx * dx) / rx) * rx + ((dy * dy) / ry) * ry
        return Math.trunc((dx * dx) / rx) * rx + Math.trunc((dy * dy) / ry) * ry <= 1;
      }
    }
    return false;
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
      return this.IsPointInArea(point);
    } else if (this.IsPointInArea(point)) {
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
      return this.IsPointInArea(point);
    } else if (this.IsPointInArea(point)) {
      // the button reacts on the button touch down
      return true;
    }

    return false;
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;

    // render
    const current = this.CurrentImage();
    const size = this.GetSize();

    const transform = this.GetTransform();

    if (current) drawList.DrawImage(current.image, current.source, transform, size.w, size.h, this.color);

    // update bounds
    const box = this.m_touchAreaType === AreaType.None ? { x: 0, y: 0, w: size.w, h: size.h } : this.GetTouchArea();
    const boxUL = TransformCoord(transform, size.w, size.h, { x: box.x, y: box.y });
    const boxDR = TransformCoord(transform, size.w, size.h, { x: box.x + box.w, y: box.y + box.h });
    const ul = { x: Math.trunc(boxUL.x), y: Math.trunc(boxUL.y) };
    const dr = { x: Math.trunc(boxDR.x), y: Math.trunc(boxDR.y) };
    this.m_bounds = { x: ul.x, y: ul.y, w: dr.x - ul.x, h: dr.y - ul.y };
  }
}
