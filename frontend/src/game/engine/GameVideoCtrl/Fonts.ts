// The fonts of text styles: a bitmap font (a PNG whose glyphs, in the order of the font's chars, are cut as the C++
// game's video_ctrl cuts them: CreateFontFromCyanSepPng) or a TrueType font (loaded as a FontFace).

import type { RssFont } from '@game/engine/Game/RuntimeExport/IResources';

const CHARS = /\[U\+([0-9A-Fa-f]{1,6})(?:-U\+([0-9A-Fa-f]{1,6}))?\]/g;

/** The characters of a Font entry's chars, such as "[U+0020][U+0030-U+0039]", in order. */
export function ParseChars(chars: string): string[] {
  const result: string[] = [];
  for (const match of chars.matchAll(CHARS)) {
    const first = parseInt(match[1], 16);
    const last = match[2] ? parseInt(match[2], 16) : first;
    for (let code = first; code <= last; code++) result.push(String.fromCodePoint(code));
  }
  return result;
}

/** A glyph's part of the font's image: its width is also how far the next glyph starts (C++'s advance_x). */
export interface Glyph {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** An image's RGBA pixels, row by row, as ImageData has them. */
export interface Pixels {
  width: number;
  height: number;
  data: ArrayLike<number>;
}

// hat_libs/video_ctrl/png_font.cpp: is_cyan, next_cyan_on_line and create_font_from_cyan_sep_png's cut of the glyphs.
// The font's quads, texture and fallback glyph are the canvas's.

function IsCyan(pixels: Pixels, x: number, y: number) {
  const i = (y * pixels.width + x) * 4;
  return pixels.data[i] === 0 && pixels.data[i + 1] === 255 && pixels.data[i + 2] === 255 && pixels.data[i + 3] !== 0;
}

/** The next cyan pixel after p on its line, or -1 (C++ clears the pixel it finds: the next search starts after it). */
function NextCyanOnLine(pixels: Pixels, p: { x: number; y: number }, limit = -1) {
  if (limit === -1) {
    limit = pixels.width;
  }
  for (let i = p.x + 1; i < limit; ++i) {
    if (IsCyan(pixels, i, p.y)) {
      return i;
    }
  }
  return -1;
}

/** The glyphs of a font image, by character: each runs from where the previous one ends (the first from the left
 * edge) to the next cyan pixel of its line's first row, the font's size tall below that row; a line without one more
 * goes on to the next line, the font's size and the cyan row lower. Throws, as C++ does, when the image runs out. */
export function CreateFontFromCyanSepPng(name: string, pixels: Pixels, fontSize: number, chars: string[]) {
  const glyphs = new Map<string, Glyph>();
  let startPoint = { x: 0, y: 0 };
  const height = fontSize;
  // offset 1 for the cyan pixel
  const offset = 1;
  for (const c of chars) {
    let x = 0;
    while ((x = NextCyanOnLine(pixels, startPoint)) === -1) {
      startPoint = { x: 0, y: startPoint.y + height + offset };
      if (startPoint.y >= pixels.height) {
        throw new Error(`Could not find codepoint : '${c}' in PNG font [${name}]. Probably caused by wrong specified range, missing cyan pixel or wrong rect.`);
      }
    }
    const copyHeight = Math.min(Math.abs(pixels.height - startPoint.y), height + offset);
    glyphs.set(c, { x: startPoint.x, y: startPoint.y + offset, w: x - startPoint.x, h: copyHeight - offset });
    startPoint = { x, y: startPoint.y };
  }
  return glyphs;
}

export class BitmapFont {
  private glyphs = new Map<string, Glyph>();
  private ready = false;
  height = 0;

  constructor(readonly font: RssFont, private readonly image: HTMLImageElement) {
    if (image.complete && image.naturalWidth) this.Index();
    else image.addEventListener('load', () => this.Index(), { once: true });
  }

  private Index() {
    const { naturalWidth: width, naturalHeight: height } = this.image;
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.image, 0, 0);
    // a line is the font's size tall (C++'s line_height), whatever the image's height
    const fontSize = this.font.size > 0 ? this.font.size : height - 1;
    try {
      this.glyphs = CreateFontFromCyanSepPng(this.font.file, ctx.getImageData(0, 0, width, height), fontSize, ParseChars(this.font.chars));
    } catch (error) {
      // C++ cannot load the font at all; the browser draws none of its glyphs either, and says why
      console.warn((error as Error).message);
    }
    this.height = fontSize;
    this.ready = true;
  }

  IsReady() {
    return this.ready;
  }

  /** The text's width at the font's own size. */
  MeasureText(text: string) {
    let width = 0;
    for (const char of text) width += this.glyphs.get(char)?.w ?? this.glyphs.get(' ')?.w ?? 0;
    return width;
  }

  Draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, scale: number) {
    for (const char of text) {
      const glyph = this.glyphs.get(char) ?? this.glyphs.get(' ');
      if (!glyph) continue;
      ctx.drawImage(this.image, glyph.x, glyph.y, glyph.w, glyph.h, x, y, glyph.w * scale, glyph.h * scale);
      x += glyph.w * scale;
    }
  }
}

export class FontCache {
  private bitmaps = new Map<string, BitmapFont>();
  private faces = new Map<string, string>();

  constructor(private readonly url: (file: string) => string, private readonly image: (file: string) => HTMLImageElement | null) {}

  IsBitmap(font: RssFont) {
    return font.file.toLowerCase().endsWith('.png');
  }

  Bitmap(font: RssFont): BitmapFont | null {
    let bitmap = this.bitmaps.get(font.id);
    if (!bitmap) {
      const image = this.image(font.file);
      if (!image) return null;
      bitmap = new BitmapFont(font, image);
      this.bitmaps.set(font.id, bitmap);
    }
    return bitmap.IsReady() ? bitmap : null;
  }

  /** The CSS family of a TrueType font, once loaded. */
  Family(font: RssFont): string | null {
    const family = this.faces.get(font.id);
    if (family) return family === 'loading' ? null : family;
    this.faces.set(font.id, 'loading');
    const name = `egt-${font.id}`;
    new FontFace(name, `url(${this.url(font.file)})`).load().then(face => {
      document.fonts.add(face);
      this.faces.set(font.id, name);
    }).catch(() => this.faces.set(font.id, 'sans-serif'));
    return null;
  }
}
