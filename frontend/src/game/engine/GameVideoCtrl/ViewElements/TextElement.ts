// Egt::GameVideoCtrl::TextElement (ViewElements/TextElement.h): a text in a text style (rssStyleId), shrunk to fit its
// fit box. Its alignment places the box (or the text, without a box) and the text within the box. A vertical text
// ("orientation": "Vertical") stacks its glyphs top to bottom, each glyph a line of its own height (or a custom one),
// optionally stretched over or centered in the fit box's height.

import type { Size, ViewElementData } from '@game/engine/Game/RuntimeExport/IResources';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '../DrawList';
import { IVideo } from '../RuntimeExport/IVideo';
import { BaseElement } from './BaseElement';

export type TextOrientation = 'Horizontal' | 'Vertical';

type TextLayout = NonNullable<ReturnType<TextElement['Layout']>>;

export class TextElement extends BaseElement {
  private text = '';
  private styleId = '';
  private fitBox: Size | null = null;
  private orientation: TextOrientation = 'Horizontal';
  private readonly customVerticalTextLineHeight = new Map<number, number>();
  private stretchVerticalLayoutToFitBox = false;
  private centerVerticalLayoutToFitBox = false;

  SetElementData(data: ViewElementData) {
    super.SetElementData(data);
    if (data.rssStyleId) this.styleId = data.rssStyleId;
    if (data.fitBox) this.fitBox = { w: data.fitBox.w, h: data.fitBox.h };
    if (data.orientation) this.orientation = data.orientation === 'Vertical' ? 'Vertical' : 'Horizontal';
  }

  GetTextOrientation() {
    return this.orientation;
  }

  SetTextOrientation(orientation: TextOrientation) {
    this.orientation = orientation;
    return this;
  }

  /** Vertical text only: the height of a line (a glyph) instead of its own. */
  SetCustomVerticalTextLineHeight(line: number, height: number) {
    this.customVerticalTextLineHeight.set(line, height);
    return this;
  }

  ResetCustomVerticalTextLineHeight() {
    this.customVerticalTextLineHeight.clear();
    return this;
  }

  /** Vertical text only: if the vertical text is shorter than the fit box height - stretch its lines over it. */
  SetStretchVerticalLayoutToFitBox(stretch: boolean) {
    this.stretchVerticalLayoutToFitBox = stretch;
    return this;
  }

  GetStretchVerticalLayoutToFitBox() {
    return this.stretchVerticalLayoutToFitBox;
  }

  /** Vertical text only: if the vertical text is shorter than the fit box height - center it in the fit box.
   * This will be ignored if SetStretchVerticalLayoutToFitBox is enabled. */
  SetCenterVerticalLayoutToFitBox(center: boolean) {
    this.centerVerticalLayoutToFitBox = center;
    return this;
  }

  GetCenterVerticalLayoutToFitBox() {
    return this.centerVerticalLayoutToFitBox;
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
  Layout(ctx: CanvasRenderingContext2D | null) {
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
    if (dummy instanceof TextElement && dummy.GetElementData().orientation) this.orientation = dummy.orientation;
    if (dummy instanceof TextElement) this.stretchVerticalLayoutToFitBox = dummy.stretchVerticalLayoutToFitBox;
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
    if (this.orientation === 'Vertical') {
      this.DrawVertical(drawList, layout);
      return;
    }
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

  /** The glyphs top to bottom, as C++'s RefreshLayout() places them: each a line of its glyph's height (the font's
   * cell height here) or its custom height, stretched over or centered in the fit box's height; each glyph is placed
   * in the box's width as the alignment says. */
  private DrawVertical(drawList: DrawList, layout: TextLayout) {
    const glyphs = [...this.text];
    const ctx = drawList.ctx;
    const widths = glyphs.map(glyph => {
      if (layout.kind === 'bitmap') return layout.bitmap.MeasureText(glyph) * layout.scale;
      if (!ctx) return layout.height * 0.5;
      ctx.font = layout.css;
      return ctx.measureText(glyph).width;
    });
    const heights = glyphs.map((_, i) => this.customVerticalTextLineHeight.get(i) ?? layout.height);
    let totalHeight = heights.reduce((sum, h) => sum + h, 0);
    const maxWidth = Math.max(0, ...widths);
    const meaningfulHeightDifference = 2; // in pixels
    let offsetY = 0;
    if (this.stretchVerticalLayoutToFitBox && this.fitBox && totalHeight > meaningfulHeightDifference) {
      const fitH = this.fitBox.h;
      if (fitH > totalHeight + meaningfulHeightDifference) {
        const scale = fitH / totalHeight;
        for (let i = 0; i < heights.length; i++) heights[i] *= scale;
        totalHeight = fitH;
      }
    }
    if (!this.stretchVerticalLayoutToFitBox && this.centerVerticalLayoutToFitBox && this.fitBox && totalHeight > meaningfulHeightDifference) {
      const fitH = this.fitBox.h;
      if (fitH > totalHeight + meaningfulHeightDifference) offsetY = 0.5 * (fitH - totalHeight);
    }
    const box = this.fitBox ?? { w: maxWidth, h: totalHeight };
    const transform = this.GetTransform();
    const color = this.color;
    drawList.WithTransform(transform, box.w, box.h, { ...color, r: 255, g: 255, b: 255 }, context => {
      let y = offsetY;
      glyphs.forEach((glyph, i) => {
        const x = (box.w - widths[i]) * transform.alignX;
        if (layout.kind === 'bitmap') {
          layout.bitmap.Draw(context, glyph, x, y, layout.scale);
        } else {
          context.font = layout.css;
          context.textBaseline = 'top';
          context.fillStyle = `rgb(${color.r},${color.g},${color.b})`;
          context.fillText(glyph, x, y);
        }
        y += heights[i];
      });
    });
  }
}
