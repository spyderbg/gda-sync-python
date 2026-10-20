// video_ctrl::draw_list: what the views draw each frame, onto the game's 2D canvas of the view resolution.

import type { Color, RssRect } from '../Game/RuntimeExport/IResources';

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

export class DrawList {
  constructor(readonly ctx: CanvasRenderingContext2D) {}

  /** Moves what is drawn until pop_transform. */
  push_transform(position: { x: number; y: number }) {
    this.ctx.save();
    this.ctx.translate(position.x, position.y);
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
