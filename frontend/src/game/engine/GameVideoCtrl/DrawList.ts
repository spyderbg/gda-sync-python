// video_ctrl::draw_list: what the views draw each frame, onto the game's 2D canvas of the view resolution.

import { transformf } from '@game/hat_libs/egt_math/transform';
import type { Color, RssRect } from '@game/engine/Game/RuntimeExport/IResources';

export interface Transform {
  x: number;
  y: number;
  scaleX: number;
  scaleY: number;
  rotation: number; // degrees
  pivotX: number;
  pivotY: number;
  /** The share of the drawn size the drawing is moved left and up by (its alignment). */
  alignX: number;
  alignY: number;
}

/** math::transformf::transform_coord of an element's transform (BaseElement::GetTransform) for a drawing of the given
 * size: where a point of the drawing lands on the screen, as WithTransform draws it. */
export function TransformCoord(transform: Transform, width: number, height: number, point: { x: number; y: number }) {
  let x = point.x - transform.alignX * width - transform.pivotX;
  let y = point.y - transform.alignY * height - transform.pivotY;
  x *= transform.scaleX;
  y *= transform.scaleY;
  if (transform.rotation) {
    const radians = (transform.rotation * Math.PI) / 180;
    const cos = Math.cos(radians);
    const sin = Math.sin(radians);
    [x, y] = [x * cos - y * sin, x * sin + y * cos];
  }
  return { x: x + transform.x + transform.pivotX, y: y + transform.y + transform.pivotY };
}

export class DrawList {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** Moves (and a math::transformf also rotates around z and scales) what is drawn until pop_transform. */
  push_transform(transform: { x: number; y: number } | transformf) {
    this.ctx.save();
    if (!(transform instanceof transformf)) {
      this.ctx.translate(transform.x, transform.y);
      return;
    }
    const position = transform.get_position();
    const scale = transform.get_scale();
    this.ctx.translate(position.x, position.y);
    this.ctx.rotate(transform.get_rotation_euler().z);
    this.ctx.scale(scale.x, scale.y);
  }

  pop_transform() {
    this.ctx.restore();
  }

  push_clip(rect: RssRect) {
    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(rect.x, rect.y, rect.w, rect.h);
    this.ctx.clip();
  }

  pop_clip() {
    this.ctx.restore();
  }

  /** Clips out rectangles: what is drawn until pop_crop shows everywhere but in them. */
  push_crop(rects: RssRect[]) {
    const ctx = this.ctx;
    ctx.save();
    ctx.beginPath();
    ctx.rect(-10000, -10000, 30000, 30000);
    for (const rect of rects) ctx.rect(rect.x, rect.y, rect.w, rect.h);
    ctx.clip('evenodd');
  }

  pop_crop() {
    this.ctx.restore();
  }

  /** Applies an element's transform for a drawing of the given size: BaseElement::GetTransform. */
  WithTransform(transform: Transform, width: number, height: number, color: Color | null, draw: (ctx: CanvasRenderingContext2D) => void) {
    const ctx = this.ctx;
    ctx.save();
    ctx.translate(transform.x + transform.pivotX, transform.y + transform.pivotY);
    if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180);
    if (transform.scaleX !== 1 || transform.scaleY !== 1) ctx.scale(transform.scaleX, transform.scaleY);
    ctx.translate(-transform.alignX * width - transform.pivotX, -transform.alignY * height - transform.pivotY);
    if (color) {
      ctx.globalAlpha *= color.a / 255;
      // A gray tint darkens; the views use it for the shadow of lines and squares.
      if (color.r < 255 || color.g < 255 || color.b < 255) ctx.filter = `brightness(${((color.r + color.g + color.b) / 765).toFixed(3)})`;
    }
    draw(ctx);
    ctx.restore();
  }

  DrawImage(image: CanvasImageSource, source: RssRect | null, transform: Transform, width: number, height: number, color: Color | null) {
    this.WithTransform(transform, width, height, color, ctx => {
      if (source) ctx.drawImage(image, source.x, source.y, source.w, source.h, 0, 0, width, height);
      else ctx.drawImage(image, 0, 0, width, height);
    });
  }

  /** video_ctrl::draw_list::add_movie_image: the frame a MovieFrame composed, at its size. */
  DrawMovie(picture: CanvasImageSource, transform: Transform, width: number, height: number, color: Color | null) {
    this.DrawImage(picture, null, transform, width, height, color);
  }
}
