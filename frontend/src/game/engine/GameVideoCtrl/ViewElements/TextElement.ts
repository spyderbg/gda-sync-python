// Egt::GameVideoCtrl::TextElement (ViewElements/TextElement.h): a text in a text style (rssStyleId), shrunk to fit its
// fit box. Its alignment places the box (or the text, without a box) and the text within the box.

import type { Size, ViewElementData } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '../DrawList';
import { IVideo } from '../RuntimeExport/IVideo';
import { BaseElement } from './BaseElement';

export class TextElement extends BaseElement {
  private text = '';
  private styleId = '';
  private fitBox: Size | null = null;

  SetElementData(data: ViewElementData) {
    super.SetElementData(data);
    if (data.rssStyleId) this.styleId = data.rssStyleId;
    if (data.fitBox) this.fitBox = { w: data.fitBox.w, h: data.fitBox.h };
  }

  SetText(text: string) {
    this.text = text;
    return this;
  }

  GetText() {
    return this.text;
  }

  SetStyleId(rssStyleId: string) {
    this.styleId = rssStyleId;
    return this;
  }

  GetFitBox() {
    return this.fitBox;
  }

  SetFitBox(size: Size | null) {
    this.fitBox = size;
    return this;
  }

  /** The style's font and size: a bitmap font scaled to the style's size, or a TrueType family. */
  private Layout(ctx: CanvasRenderingContext2D | null) {
    const resources = this.RuntimeGet(IResources);
    const style = this.styleId ? resources.GetTextStyle(this.styleId) : null;
    const font = style ? resources.GetFont(style.font_id) : null;
    const fonts = this.RuntimeGet(IVideo).GetFonts();
    const size = style?.size ?? 30;
    if (font && fonts.IsBitmap(font)) {
      const bitmap = fonts.Bitmap(font);
      if (!bitmap) return null;
      const scale = size / Math.max(font.size, 1);
      return { kind: 'bitmap' as const, bitmap, scale, width: bitmap.MeasureText(this.text) * scale, height: bitmap.height * scale };
    }
    const family = font ? fonts.Family(font) : 'sans-serif';
    if (!family) return null;
    const css = `bold ${size}px ${family === 'sans-serif' ? family : `"${family}", sans-serif`}`;
    let width = this.text.length * size * 0.5;
    if (ctx) {
      ctx.font = css;
      width = ctx.measureText(this.text).width;
    }
    return { kind: 'ttf' as const, css, scale: 1, width, height: size };
  }

  /** Takes a Dummy element's place, and its fit box when it is a text. */
  SetFromDummy(dummy: BaseElement | null) {
    super.SetFromDummy(dummy);
    if (dummy instanceof TextElement && dummy.fitBox) this.fitBox = { ...dummy.fitBox };
    return this;
  }

  GetSize(): Size {
    if (this.fitBox) return { ...this.fitBox };
    const layout = this.Layout(null);
    return layout ? { w: layout.width, h: layout.height } : { w: 0, h: 0 };
  }

  Draw(drawList: DrawList) {
    if (this.hidden || !this.text) return;
    const layout = this.Layout(drawList.ctx);
    if (!layout) return;
    const box = this.fitBox ?? { w: layout.width, h: layout.height };
    const shrink = this.fitBox ? Math.min(1, this.fitBox.w / Math.max(layout.width, 1), this.fitBox.h / Math.max(layout.height, 1)) : 1;
    const transform = this.GetTransform();
    const width = layout.width * shrink;
    const height = layout.height * shrink;
    // Within the box, the text is aligned as the box is.
    const x = (box.w - width) * transform.alignX;
    const y = (box.h - height) * transform.alignY;
    const color = this.color;
    drawList.WithTransform(transform, box.w, box.h, { ...color, r: 255, g: 255, b: 255 }, ctx => {
      if (layout.kind === 'bitmap') {
        layout.bitmap.Draw(ctx, this.text, x, y, layout.scale * shrink);
      } else {
        ctx.font = layout.css;
        ctx.textBaseline = 'top';
        ctx.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
        ctx.save();
        ctx.translate(x, y);
        ctx.scale(shrink, shrink);
        ctx.fillText(this.text, 0, 0);
        ctx.restore();
      }
    });
  }
}
