import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { classes } from '../classes';
import { baseName, firstRtfPage, number, plural, reportPreviewURL } from '../format';
import type { RtfFacts, RtfLayout, RtfLayoutPage, RtfRun, RtfSection, RtfStyle } from '../types';
import CheckBox from './CheckBox';

// The pages of an RTF, a project of the RTF Tool such as a game's help screens. A card shows the chosen page's
// background, and a strip of the backgrounds of all its pages to choose from, the first page with a background at
// first; clicking the page itself opens the details. A large preview draws the chosen page approximately as the game
// does: the page at its own resolution, scaled to fit, with its background and each text section in its rectangle,
// aligned, in its style and in the chosen language, with inline images and a video's first frame, and drawn smaller
// when it does not fit. A paytable figure, which the game computes, and a variable that the game fills in are outlined;
// an image that does not exist is a dashed box with its id. The text is drawn with the app's own font, not the game's.
// The large preview loads the layout of the pages from the report preview endpoint. Text areas outlines every section
// with its name, in the color the RTF Tool outlines the page's sections with.

// A large preview is at most this share of the window's height.
const STAGE_HEIGHT = 0.58;
const FALLBACK_STYLE: RtfStyle = { face: 'Regular', weight: 400, size: 40, fill: ['#ffffff'], letterSpacing: 0, lineSpacing: 0 };
const AREA_COLOR = '#0061ff';

/** A section's text that does not fit its rectangle is drawn smaller, as the RTF Tool draws it, from the side it is aligned to. */
function fitText(text: HTMLElement) {
  const section = text.parentElement;
  if (!section?.clientWidth || !section.clientHeight || !text.offsetWidth || !text.offsetHeight) return;
  const fit = Math.min(1, section.clientWidth / text.offsetWidth, section.clientHeight / text.offsetHeight);
  text.style.transform = fit < 1 ? `scale(${fit})` : '';
}

const media = (run: RtfRun): string | null => ('image' in run ? run.image : 'video' in run ? run.video : null);

export default function RtfPreview({
  file, name, revision, facts, large = false, page: pageProp, onPageChange,
}: {
  /** The project's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  facts: RtfFacts;
  large?: boolean;
  page?: number;
  onPageChange?: (page: number) => void;
}) {
  const [localPage, setLocalPage] = useState<number | undefined>(undefined);
  const chosen = pageProp !== undefined ? pageProp : localPage;
  // The page shown: the one chosen, or at first the first page with a background.
  const index = chosen !== undefined && chosen < facts.pages.length ? chosen : firstRtfPage(facts);
  const page = facts.pages[index] ?? null;

  const [failed, setFailed] = useState(() => new Set<string>());
  const sourceKey = `${file}\0${revision}`;
  const [failedKey, setFailedKey] = useState(sourceKey);
  if (sourceKey !== failedKey) {
    setFailedKey(sourceKey);
    setFailed(new Set());
  }
  const url = (path: string) => reportPreviewURL(path, revision);
  const shows = (path: string | null): path is string => !!path && !failed.has(path);
  const fail = (path: string | null) => {
    if (!path) return;
    setFailed(current => {
      if (current.has(path)) return current;
      const next = new Set(current);
      next.add(path);
      return next;
    });
  };
  function selectPage(next: number) {
    setLocalPage(next);
    onPageChange?.(next);
  }

  const [layout, setLayout] = useState<RtfLayout | null>(null);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const [error, setError] = useState('');
  const [language, setLanguage] = useState('');
  const [areas, setAreas] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    if (!large) return undefined;
    const id = ++requestRef.current;
    let cancelled = false;
    setState('loading');
    void (async () => {
      try {
        const response = await fetch(reportPreviewURL(file, revision));
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (cancelled || id !== requestRef.current) return;
        if (!response.ok || !body) throw new Error(body?.error || 'The pages could not be loaded');
        const next = body as RtfLayout;
        setLayout(next);
        setLanguage(current => (next.languages.includes(current) ? current : next.languages[0] ?? ''));
        setState('ready');
      } catch (e) {
        if (cancelled || id !== requestRef.current) return;
        setError((e as Error).message);
        setState('failed');
      }
    })();
    return () => { cancelled = true; };
  }, [large, file, revision]);

  const shown: RtfLayoutPage | null = layout?.pages[index] ?? null;
  const styleOf = (styleName?: string) => (styleName && layout?.styles[styleName]) || FALLBACK_STYLE;

  // The page is drawn at its own resolution, then scaled to the width of the stage and the height it may have.
  const stageRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = stageRef.current;
    if (!large || !element) return undefined;
    const observer = new ResizeObserver(entries => {
      const next = entries[0]?.contentRect.width ?? 0;
      setWidth(current => (current === next ? current : next));
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, [large]);

  // Its size changes when its images load, and with the language.
  const pageRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!large) return undefined;
    const fitter = new ResizeObserver(entries => {
      for (const entry of entries) fitText(entry.target as HTMLElement);
    });
    const timer = window.setTimeout(() => {
      pageRef.current?.querySelectorAll<HTMLElement>('.rtf-section-text').forEach(text => fitter.observe(text));
    }, 0);
    return () => {
      window.clearTimeout(timer);
      fitter.disconnect();
    };
  }, [large, shown, language, state]);

  const scale = shown && width ? Math.min(width / shown.width, window.innerHeight * STAGE_HEIGHT / shown.height) : 0;
  const pageStyle: CSSProperties = shown ? {
    width: `${shown.width}px`,
    height: `${shown.height}px`,
    transform: `scale(${scale})`,
    left: `${(width - shown.width * scale) / 2}px`,
    '--rtf-area': shown.color ?? AREA_COLOR,
  } as CSSProperties : {};

  function sectionStyle(section: RtfSection): CSSProperties {
    const style = styleOf(section.style);
    const text = textOf(section);
    return {
      left: `${section.x}px`, top: `${section.y}px`, width: `${section.w}px`, height: `${section.h}px`,
      fontSize: `${style.size}px`, lineHeight: `calc(1.2em + ${style.lineSpacing}px)`,
      textTransform: text?.case === 'uppercase' ? 'uppercase' : undefined,
      fontVariant: text?.case === 'small_caps' ? 'small-caps' : undefined,
    };
  }

  /** How a run's text is drawn in a style: its weight, size, spacing and fill, a gradient clipped to each line, and its
   * outline and shadow as drop shadows, which follow the shapes of the letters. */
  function runStyle(styleName?: string): CSSProperties {
    const style = styleOf(styleName);
    const filters: string[] = [];
    if (style.outline) {
      const { color, width: line } = style.outline;
      for (const [x, y] of [[line, 0], [-line, 0], [0, line], [0, -line]]) filters.push(`drop-shadow(${x}px ${y}px 0 ${color})`);
    }
    if (style.shadow) filters.push(`drop-shadow(${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur * style.size / 10}px ${style.shadow.color})`);
    const fill: CSSProperties = style.fill.length > 1
      ? {
        backgroundImage: `linear-gradient(${style.fill.join(', ')})`, backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent',
        boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone',
      }
      : { color: style.fill[0] };
    return {
      fontWeight: style.weight, fontSize: `${style.size}px`, letterSpacing: `${style.letterSpacing}px`, ...fill,
      ...(filters.length ? { filter: filters.join(' ') } : {}),
    };
  }

  /** The height an inline image or video may have: its section's or its own style's size, times the text's image scale. */
  const imageHeight = (section: RtfSection, run: { scale: number; style?: string }) => styleOf(run.style ?? section.style).size * run.scale;
  const textOf = (section: RtfSection) => section.texts[language] ?? Object.values(section.texts)[0];
  const runsOf = (section: RtfSection): RtfRun[] => textOf(section)?.runs ?? [];
  const missingSummary = `${number(facts.missingCount)} missing file${plural(facts.missingCount)}`;

  function renderRun(section: RtfSection, run: RtfRun, runIndex: number) {
    if ('text' in run) return <span key={runIndex} style={runStyle(run.style ?? section.style)}>{run.text}</span>;
    if ('image' in run || 'video' in run) {
      const path = media(run);
      const height = imageHeight(section, run);
      if (run.found && shows(path)) {
        return (
          <img key={runIndex} className={classes('rtf-inline', { 'is-video': 'video' in run })} src={url(path)} style={{ maxHeight: `${height}px` }}
            alt={run.id} title={'video' in run ? `${run.id}, ${number(run.frames)} frames at ${run.fps} fps` : run.id} onError={() => fail(path)} />
        );
      }
      return <span key={runIndex} className="rtf-placeholder is-missing" style={{ height: `${Math.min(height, section.h)}px` }} title={`${run.id} does not exist`}>{run.id}</span>;
    }
    if ('figure' in run) return <span key={runIndex} className="rtf-placeholder" style={runStyle(run.style ?? section.style)} title="A win that the game computes">{run.figure}</span>;
    return (
      <span key={runIndex} className={!run.value ? 'rtf-placeholder' : undefined} style={runStyle(run.style ?? section.style)}
        title={run.value ? `${run.variable}, as the project names it` : 'A value that the game fills in'}>{run.value ?? run.variable}</span>
    );
  }

  if (!large) {
    return (
      <div className="rtf-preview">{[
        <button key="open" type="button" className="rtf-preview-open" aria-label={`Inspect ${name}`}>
          <div className="thumbnail rtf-preview-page">{[
            page && shows(page.background) && page.found
              ? <img key="image" src={url(page.background)} alt={`${page.id} page of ${name}`} loading="lazy" onError={() => fail(page.background)} />
              : <div key="empty" className="generic-preview rtf">{[
                <i key="icon" aria-hidden="true" className={classes('mdi', page ? 'mdi-image-off-outline' : 'mdi-book-open-page-variant-outline')} />,
                <small key="label">{page ? 'No background' : 'No pages'}</small>,
              ]}</div>,
            <span key="badge" className="badge file-format">RTF</span>,
            page ? <span key="caption" className="rtf-preview-caption">{page.id} · {page.width} × {page.height}</span> : null,
          ]}</div>
        </button>,
        facts.pages.length > 1 ? (
          <div key="strip" className="rtf-preview-strip" role="group" aria-label={`Pages of ${name}`}>{facts.pages.map((item, i) => (
            <button key={item.id} type="button" className={classes('rtf-preview-thumb', { active: i === index })}
              aria-pressed={i === index} aria-label={`Show page ${item.id}`} title={item.id} onClick={event => { event.stopPropagation(); selectPage(i); }}>{item.found && shows(item.background)
              ? <img src={url(item.background)} alt="" loading="lazy" onError={() => fail(item.background)} />
              : <i aria-hidden="true" className="mdi mdi-image-off-outline" />}</button>
          ))}</div>
        ) : null,
      ]}</div>
    );
  }

  return (
    <div className="rtf-viewer">
      <div className="rtf-viewer-toolbar">{[
        layout && layout.languages.length > 1 ? (
          <div key="languages" className="btn-group btn-group-sm" role="group" aria-label="Language">{layout.languages.map(item => (
            <button key={item} type="button" className={classes('btn', 'btn-secondary', { active: item === language })} aria-pressed={item === language} onClick={() => setLanguage(item)}>{item}</button>
          ))}</div>
        ) : null,
        <CheckBox key="areas" checked={areas} label="Show text areas" onChange={setAreas}>Text areas</CheckBox>,
        facts.missingCount ? <span key="missing" className="rtf-viewer-missing"><i aria-hidden="true" className="mdi mdi-alert-outline" />{missingSummary}</span> : null,
      ]}</div>
      <div ref={stageRef} className="rtf-stage" style={{ height: shown && scale ? `${shown.height * scale}px` : undefined }}>
        {state !== 'ready' ? (
          <p className="rtf-stage-state text-muted"><i aria-hidden="true" className={classes('mdi', state === 'loading' ? 'mdi-loading mdi-spin' : 'mdi-alert-circle-outline text-danger')} />{state === 'loading' ? 'Loading the pages…' : error}</p>
        ) : shown ? (
          <div ref={pageRef} className={classes('rtf-page', { 'show-areas': areas })} style={pageStyle} role="group" aria-label={`Page ${shown.id}`}>{[
            shown.found && shows(shown.background)
              ? <img key="background" className="rtf-page-background" src={url(shown.background)} alt="" onError={() => fail(shown.background)} />
              : <div key="missing" className="rtf-page-missing"><i aria-hidden="true" className="mdi mdi-image-off-outline" />{shown.background ? `${baseName(shown.background)} does not exist` : 'The background is not mapped'}</div>,
            ...shown.sections.map(section => (
              <div key={section.id} className={classes('rtf-section', `is-${section.horizontal}`, `is-${section.vertical}`, { 'is-wrapped': section.wrap })}
                style={sectionStyle(section)} title={`${section.id} · ${section.style}${section.variants > 1 ? ` · ${section.variants} variants` : ''}`} data-section={section.id}>{[
                <div key="text" className="rtf-section-text">{runsOf(section).map((run, runIndex) => renderRun(section, run, runIndex))}</div>,
                areas ? <small key="name" className="rtf-section-name">{section.id}</small> : null,
              ]}</div>
            )),
          ]}</div>
        ) : null}
      </div>
      {facts.pages.length ? (
        <div className="rtf-preview-strip is-large" role="group" aria-label={`Pages of ${name}`}>{facts.pages.map((item, i) => (
          <button key={item.id} type="button" className={classes('rtf-preview-thumb', { active: i === index })}
            aria-pressed={i === index} aria-label={`Show page ${item.id}`} onClick={() => selectPage(i)}>{[
            <span key="image" className="rtf-preview-thumb-image">{item.found && shows(item.background)
              ? <img src={url(item.background)} alt="" loading="lazy" onError={() => fail(item.background)} />
              : <i aria-hidden="true" className="mdi mdi-image-off-outline" />}</span>,
            <small key="id">{item.id}</small>,
          ]}</button>
        ))}</div>
      ) : null}
      <p className="rtf-viewer-note text-muted">{page ? `${page.id} · ${page.width} × ${page.height}${page.standard ? ` ${page.standard}` : ''} · ${number(page.sections)} text section${plural(page.sections)}. ` : null}Drawn approximately, with the app's font; wins the game computes and values it fills in are outlined.</p>
    </div>
  );
}
