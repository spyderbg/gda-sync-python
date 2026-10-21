// The fonts of text styles: a bitmap font (a PNG strip whose first row marks where each glyph starts, in the order of
// the font's chars) or a TrueType font (loaded as a FontFace).

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

interface Glyph {
  x: number;
  w: number;
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
    canvas.height = 1;
    const ctx = canvas.getContext('2d', { willReadFrequently: true })!;
    ctx.drawImage(this.image, 0, 0, width, 1, 0, 0, width, 1);
    const row = ctx.getImageData(0, 0, width, 1).data;
    const markers: number[] = [];
    for (let x = 0; x < width; x++) if (row[x * 4 + 3] > 0) markers.push(x);
    const chars = ParseChars(this.font.chars);
    if (markers.length >= chars.length + 1) {
      chars.forEach((char, i) => this.glyphs.set(char, { x: markers[i] + 1, w: markers[i + 1] - markers[i] - 1 }));
    } else {
      // No markers: glyphs of equal width.
      const w = width / Math.max(chars.length, 1);
      chars.forEach((char, i) => this.glyphs.set(char, { x: Math.round(i * w), w: Math.round(w) }));
    }
    this.height = height - 1;
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
      ctx.drawImage(this.image, glyph.x, 1, glyph.w, this.height, x, y, glyph.w * scale, this.height * scale);
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
