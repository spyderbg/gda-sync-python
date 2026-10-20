// Egt::GameVideoCtrl::RtfElement (ViewElements/RtfElement.h/.cpp): the pages of an RTF (RssRtfsData.json), drawn one at a
// time: the page's background, then each text section's runs in its rectangle, aligned, in its style and the chosen
// language, wrapped if it wraps and drawn smaller if it does not fit. The game fills in the paytable figures (a figure's
// win, by its first id, count and multiplier) and the variables (_serial_number_, _win_capping_limit_...).
//
// The C++ element draws with the RTF Tool's renderer and the project's fonts; here the backend lays the project out
// (the asset library's RTF preview) and the canvas draws it with the app's font, so the text is close, not exact.

import { IResources } from '../../Game/RuntimeExport/IResources';
import { Runtime } from '../../GameCore/RuntimeAccess';
import type { DrawList } from '../DrawList';
import { IVideo } from '../RuntimeExport/IVideo';
import type { RtfLayout, RtfLayoutPage, RtfRun, RtfSection, RtfStyle } from '../Rtf/RtfLayout';
import { BaseElement } from './BaseElement';

const FONT_FAMILY = '"Roboto Variable", Roboto, Arial, sans-serif';
const FALLBACK_STYLE: RtfStyle = { face: 'Regular', weight: 400, size: 40, fill: ['#ffffff'], letterSpacing: 0, lineSpacing: 0 };

const GambleLimit = '_gamble_limit_';
const WinCappingLimit = '_win_capping_limit_';
const GambleAttempts = '_max_gamble_attempts_';
const SerialNumber = '_serial_number_';
const JackpotMultiplier = '_jackpot_multiplier_';
const CertificationCode = '_certification_code_';
const GambleCappingLimit = '_gamble_capping_limit_';
const CurrencyType = '_currency_type_';

/** A figure of a paytable: the win of count symbols of a name, at a multiplier. */
export interface FigureKey {
  name: string;
  count: number;
  multiplier: number;
}

export type PaytableFiguresTextType = Map<string, string>;

/** A FigureKey as a key of PaytableFiguresTextType (a Map, which keys objects by identity; C++'s std::map keys the
 * struct itself).
 * @cppKey */
export function FigureKeyString(key: FigureKey) {
  return `${key.name}|${key.count}|${key.multiplier}`;
}

export enum ERtfTags {
  eCustomCurrency,
}

/** A piece of a line: text in a style, or an inline image. */
type Piece = { kind: 'text'; text: string; style: RtfStyle; width: number } | { kind: 'image'; image: HTMLImageElement | null; width: number; height: number };

interface LaidLine {
  pieces: Piece[];
  width: number;
  height: number;
  /** The largest text or image of the line. */
  size: number;
}

interface LaidSection {
  section: RtfSection;
  lines: LaidLine[];
  width: number;
  height: number;
}

export class RtfElement extends BaseElement {
  private m_layout: RtfLayout | null = null;
  private m_loading = false;
  private m_activePageName = '';
  private m_language = '';
  private readonly m_textLookups = new Map<string, string>();
  private m_figureLookups: PaytableFiguresTextType = new Map();
  private readonly m_tags = new Set<ERtfTags>();
  private m_shownWins: FigureKey[] = [];
  // The laid-out sections of a page, until what they show changes.
  private readonly m_laidPages = new Map<string, { version: number; sections: LaidSection[]; complete: boolean }>();
  private m_version = 0;
  private m_measure: CanvasRenderingContext2D | null = null;

  Init(runtime: Runtime, key = '') {
    super.Init(runtime, key);
  }

  /** Loads the RTF's pages. */
  Load() {
    if (this.m_layout || this.m_loading || !this.key) return;
    const resources = this.RuntimeGet(IResources);
    const rtf = resources.GetRtf(this.key);
    if (!rtf) return;
    this.m_loading = true;
    void resources.LoadRtfLayout(rtf.file).then(layout => {
      this.m_layout = layout;
      if (!this.m_language || !layout.languages.includes(this.m_language)) this.m_language = layout.languages[0] ?? '';
      this.Invalidate();
    }).catch(error => console.warn(`RtfElement ${this.key}: ${(error as Error).message}`)).finally(() => {
      this.m_loading = false;
    });
  }

  IsLoaded() {
    return this.m_layout !== null;
  }

  private Invalidate() {
    this.m_version++;
  }

  SetPage(newPageName: string) {
    if (this.m_activePageName === newPageName) return false;
    this.m_activePageName = newPageName;
    return true;
  }

  GetPage() {
    return this.m_activePageName;
  }

  /** Lays out a page again before it shows. */
  RefreshPage(pageName: string) {
    this.m_laidPages.delete(pageName);
  }

  SetLanguage(language: string) {
    if (this.m_language === language || !language) return;
    this.m_language = language;
    this.Invalidate();
  }

  private SetText(name: string, value: string) {
    if (this.m_textLookups.get(name) === value) return;
    this.m_textLookups.set(name, value);
    this.Invalidate();
  }

  SetCertificationCode(certificationCode: string) {
    this.SetText(CertificationCode, certificationCode);
  }

  SetSerialNumber(serialNumber: string) {
    this.SetText(SerialNumber, serialNumber);
  }

  SetPaytableTexts(paytableText: PaytableFiguresTextType) {
    this.m_figureLookups = new Map(paytableText);
    this.Invalidate();
  }

  SetCurrencyType(currencyType: string) {
    this.SetText(CurrencyType, currencyType);
  }

  SetGambleLimits(gambleLimitText: string, maxGambleAttemptsText: string) {
    this.SetText(GambleLimit, gambleLimitText);
    this.SetText(GambleAttempts, maxGambleAttemptsText);
  }

  SetWinCappingLimit(winCappingLimitText: string) {
    this.SetText(WinCappingLimit, winCappingLimitText);
  }

  SetJackpotMultiplier(jackpotMultiplierText: string) {
    this.SetText(JackpotMultiplier, jackpotMultiplierText);
  }

  SetGambleCapLimit(gambleCapText: string) {
    this.SetText(GambleCappingLimit, gambleCapText);
  }

  // The text variants of tags (eCustomCurrency...) are not in the layout, which has each section's default text.
  AddTag(tag: ERtfTags) {
    this.m_tags.add(tag);
  }

  RemoveTag(tag: ERtfTags) {
    this.m_tags.delete(tag);
  }

  ShowWinLine(figureName: string, count: number, multiplier: number) {
    this.m_shownWins.push({ name: figureName, count, multiplier });
  }

  HideWins(_hide: boolean) {
    this.m_shownWins = [];
  }

  GetSize() {
    const page = this.Page(this.m_activePageName);
    return page ? { w: page.width, h: page.height } : { w: 0, h: 0 };
  }

  /** The active page; the info view draws pages itself with DrawPage. */
  Draw(drawList: DrawList) {
    if (this.hidden || !this.m_activePageName) return;
    this.DrawPage(this.m_activePageName, drawList);
  }

  private Page(name: string): RtfLayoutPage | null {
    return this.m_layout?.pages.find(page => page.id === name) ?? null;
  }

  DrawPage(pageName: string, drawList: DrawList) {
    this.Load();
    const page = this.Page(pageName);
    if (!page) return;
    const ctx = drawList.ctx;
    const images = this.RuntimeGet(IVideo).GetImages();
    if (page.background && page.found) {
      const background = images.Get(page.background);
      if (background) ctx.drawImage(background, 0, 0, page.width, page.height);
    }
    for (const laid of this.LaidPage(page)) this.DrawSection(ctx, laid);
  }

  // Layout -------------------------------------------------------------------------------------------------------------

  private Style(name?: string) {
    return (name && this.m_layout?.styles[name]) || FALLBACK_STYLE;
  }

  private Font(style: RtfStyle) {
    return `${style.weight} ${style.size}px ${FONT_FAMILY}`;
  }

  private Measure(text: string, style: RtfStyle) {
    this.m_measure ??= document.createElement('canvas').getContext('2d');
    const ctx = this.m_measure!;
    ctx.font = this.Font(style);
    ctx.letterSpacing = `${style.letterSpacing}px`;
    const metrics = ctx.measureText(text);
    return metrics.width;
  }

  private LaidPage(page: RtfLayoutPage) {
    const cached = this.m_laidPages.get(page.id);
    if (cached && cached.version === this.m_version && cached.complete) return cached.sections;
    let complete = true;
    const sections = page.sections.map(section => {
      const laid = this.LaySection(section);
      if (laid.pending) complete = false;
      return laid.laid;
    });
    this.m_laidPages.set(page.id, { version: this.m_version, sections, complete });
    return sections;
  }

  /** The text of a run: its own, a figure's win, or a variable's value. */
  private RunText(run: RtfRun): string | null {
    if ('text' in run) return run.text;
    if ('figure' in run) {
      const key = { name: run.ids?.[0] ?? '', count: run.count ?? 0, multiplier: run.multiplier ?? 1 };
      // failsafe to show which are missing
      return this.m_figureLookups.get(FigureKeyString(key)) ?? `${key.name}::${key.count}X${key.multiplier}`;
    }
    if ('variable' in run) return this.m_textLookups.get(run.variable) ?? run.value ?? '';
    return null;
  }

  private LaySection(section: RtfSection): { laid: LaidSection; pending: boolean } {
    const text = section.texts[this.m_language] ?? Object.values(section.texts)[0];
    const sectionStyle = this.Style(section.style);
    const images = this.RuntimeGet(IVideo).GetImages();
    let pending = false;
    // The pieces of the text, with the line breaks it has.
    const pieces: (Piece | 'break')[] = [];
    for (const run of text?.runs ?? []) {
      const style = this.Style(run.style ?? section.style);
      if ('image' in run || 'video' in run) {
        const file = 'image' in run ? run.image : run.video;
        const height = style.size * run.scale;
        const image = file && run.found ? images.Get(file) : null;
        if (file && run.found && !image) pending = true;
        const width = image ? (height * image.naturalWidth) / Math.max(image.naturalHeight, 1) : 0;
        pieces.push({ kind: 'image', image: 'image' in run ? image : null, width: Math.min(width, section.w), height });
        continue;
      }
      let value = this.RunText(run) ?? '';
      if (text?.case === 'uppercase' || text?.case === 'small_caps') value = value.toUpperCase();
      value.split('\n').forEach((line, i) => {
        if (i > 0) pieces.push('break');
        // words with the spaces after them, so that a wrapped line breaks between words
        for (const word of line.match(/\S+\s*|\s+/g) ?? []) pieces.push({ kind: 'text', text: word, style, width: this.Measure(word, style) });
      });
    }
    const lines: LaidLine[] = [];
    let current: Piece[] = [];
    let width = 0;
    const endLine = () => {
      const size = Math.max(sectionStyle.size, ...current.map(piece => (piece.kind === 'text' ? piece.style.size : piece.height)));
      lines.push({ pieces: current, width, height: size * 1.2 + sectionStyle.lineSpacing, size });
      current = [];
      width = 0;
    };
    for (const piece of pieces) {
      if (piece === 'break') {
        endLine();
        continue;
      }
      if (section.wrap && current.length && width + piece.width > section.w) {
        // a line does not end with the space before a break
        endLine();
      }
      current.push(piece);
      width += piece.width;
    }
    if (current.length || !lines.length) endLine();
    const totalWidth = Math.max(...lines.map(line => line.width), 0);
    const totalHeight = lines.reduce((sum, line) => sum + line.height, 0);
    return { laid: { section, lines, width: totalWidth, height: totalHeight }, pending };
  }

  // Drawing ------------------------------------------------------------------------------------------------------------

  private DrawSection(ctx: CanvasRenderingContext2D, laid: LaidSection) {
    const { section } = laid;
    if (!laid.lines.length || !laid.width) return;
    // A text that does not fit its rectangle is drawn smaller, from the side it is aligned to.
    const fit = Math.min(1, section.w / Math.max(laid.width, 1), section.h / Math.max(laid.height, 1));
    const height = laid.height * fit;
    let y = section.vertical === 'top' ? section.y : section.vertical === 'bottom' ? section.y + section.h - height : section.y + (section.h - height) / 2;
    ctx.save();
    for (const line of laid.lines) {
      const lineWidth = line.width * fit;
      let x = section.horizontal === 'left' ? section.x : section.horizontal === 'right' ? section.x + section.w - lineWidth : section.x + (section.w - lineWidth) / 2;
      // The baseline of a line of 1.2 em: the font's ascent is about 0.93 em, under a tenth of the extra space.
      const baseline = y + (line.size * 0.95 + (line.height - line.size * 1.2) / 2) * fit;
      for (const piece of line.pieces) {
        if (piece.kind === 'image') {
          if (piece.image) ctx.drawImage(piece.image, x, baseline - piece.height * fit * 0.85, piece.width * fit, piece.height * fit);
        } else {
          this.DrawText(ctx, piece.text, piece.style, x, baseline, fit);
        }
        x += piece.width * fit;
      }
      y += line.height * fit;
    }
    ctx.restore();
  }

  private DrawText(ctx: CanvasRenderingContext2D, text: string, style: RtfStyle, x: number, baseline: number, fit: number) {
    if (!text.trim()) return;
    const size = style.size * fit;
    ctx.font = `${style.weight} ${size}px ${FONT_FAMILY}`;
    ctx.letterSpacing = `${style.letterSpacing * fit}px`;
    ctx.textBaseline = 'alphabetic';
    if (style.fill.length > 1) {
      const gradient = ctx.createLinearGradient(0, baseline - size * 0.75, 0, baseline);
      style.fill.forEach((color, i) => gradient.addColorStop(i / (style.fill.length - 1), color));
      ctx.fillStyle = gradient;
    } else {
      ctx.fillStyle = style.fill[0] ?? '#ffffff';
    }
    if (style.shadow) {
      ctx.shadowColor = style.shadow.color;
      ctx.shadowOffsetX = (style.shadow.x * size) / 10;
      ctx.shadowOffsetY = (style.shadow.y * size) / 10;
      ctx.shadowBlur = (style.shadow.blur * size) / 10;
    }
    if (style.outline && style.outline.width > 0) {
      ctx.strokeStyle = style.outline.color;
      ctx.lineJoin = 'round';
      ctx.lineWidth = style.outline.width * size;
      ctx.strokeText(text, x, baseline);
      ctx.shadowColor = 'transparent';
    }
    ctx.fillText(text, x, baseline);
    ctx.shadowColor = 'transparent';
  }
}
