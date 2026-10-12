import { useEffect, useId, useMemo, useRef, useState, type ChangeEvent, type CSSProperties } from 'react';
import { classes } from '../classes';
import { characterRanges, codePoint, number, reportPreviewURL, size as fileSize } from '../format';
import type { FontFacts } from '../types';

// A font file drawn with itself. The browser loads it from the report preview endpoint into a FontFace, which the text
// below uses by its own family name; the response also brings the font's names and the samples of the writing systems
// it can draw. A card loads the font once it scrolls into view, and does not load one larger than CARD_LIMIT until
// asked; it shows two characters and a sample line of the font's first writing system. A large preview is a specimen:
// the font's name, its alphabets and digits, a sample of each other writing system, a waterfall of text to type at
// several sizes, the declared one among them, and the declared characters, a row for each range, with the ones the font
// misses marked.
const CARD_LIMIT = 2 * 1024 * 1024;
const FALLBACK = { script: 'Latin', pair: 'Aa', text: 'The quick brown fox jumps over the lazy dog.' };
const ALPHABETS = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789.:,;(*!?\')'];
const WATERFALL = [12, 16, 20, 24, 32, 40, 48, 60, 72];
const NO_POINTS: number[] = [];

type FontState = 'idle' | 'loading' | 'ready' | 'large' | 'failed';

function readFacts(response: Response): FontFacts | null {
  const header = response.headers.get('x-font-facts');
  try {
    return header ? JSON.parse(decodeURIComponent(header)) as FontFacts : null;
  } catch {
    return null;
  }
}

export default function FontPreview({
  file, name, revision, large = false, chars = '', size = 0, missing = NO_POINTS, text = '', onTextChange,
}: {
  /** The font's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  large?: boolean;
  /** A Font entry's declared characters, such as "[U+0020-U+00FF]", and its size in pixels. */
  chars?: string;
  size?: number;
  /** The declared characters the font misses, from the backend's check. */
  missing?: number[];
  /** The text to draw, shared by previews shown side by side. */
  text?: string;
  onTextChange?: (text: string) => void;
}) {
  // React's useId contains colons, which a FontFace family name rejects unless they are removed.
  const family = `font-preview-${useId().replaceAll(':', '')}`;
  const [state, setState] = useState<FontState>('idle');
  const [bytes, setBytes] = useState(0);
  const [error, setError] = useState('');
  const [facts, setFacts] = useState<FontFacts | null>(null);
  const [typed, setTyped] = useState(text);
  const [seenText, setSeenText] = useState(text);
  const rootRef = useRef<HTMLDivElement>(null);
  const faceRef = useRef<FontFace | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const requestRef = useRef(0);
  const stateRef = useRef(state);
  stateRef.current = state;
  const fileRef = useRef(file);
  fileRef.current = file;
  const revisionRef = useRef(revision);
  revisionRef.current = revision;
  const largeRef = useRef(large);
  largeRef.current = large;

  if (text !== seenText) {
    setSeenText(text);
    setTyped(text);
  }

  const fontStyle = useMemo<CSSProperties>(() => ({ fontFamily: `"${family}"` }), [family]);
  // Without the font's samples, as from an older backend, it is shown as a Latin font.
  const samples = useMemo(() => (facts?.samples?.length ? facts.samples : facts?.samples ? [] : [FALLBACK]), [facts]);
  const first = samples[0] ?? FALLBACK;
  const latin = samples.some(sample => sample.script === 'Latin');
  const others = useMemo(() => samples.filter(sample => sample.script !== 'Latin'), [samples]);
  const title = facts?.family ? `${facts.family}${facts.style ? `, ${facts.style}` : ''}` : name;
  // The waterfall's sizes, with the declared one.
  const sizes = useMemo(() => [...new Set([...WATERFALL, ...(size ? [size] : [])])].sort((a, b) => a - b), [size]);
  const ranges = useMemo(() => characterRanges(chars), [chars]);
  const missingSet = useMemo(() => new Set(missing), [missing]);

  function release() {
    if (faceRef.current) document.fonts.delete(faceRef.current);
    faceRef.current = null;
  }

  async function load(force = false) {
    const id = ++requestRef.current;
    release();
    stateRef.current = 'loading';
    setState('loading');
    try {
      const response = await fetch(reportPreviewURL(fileRef.current, revisionRef.current));
      if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'The font could not be loaded');
      const length = Number(response.headers.get('content-length') || 0);
      if (!largeRef.current && !force && length > CARD_LIMIT) {
        void response.body?.cancel();
        if (id === requestRef.current) {
          setBytes(length);
          stateRef.current = 'large';
          setState('large');
        }
        return;
      }
      const found = readFacts(response);
      const loaded = await new FontFace(family, await response.arrayBuffer()).load().catch(() => {
        throw new Error('The browser cannot draw this font');
      });
      if (id !== requestRef.current) return;
      faceRef.current = loaded;
      setFacts(found);
      document.fonts.add(loaded);
      stateRef.current = 'ready';
      setState('ready');
    } catch (e) {
      if (id !== requestRef.current) return;
      setError((e as Error).message);
      stateRef.current = 'failed';
      setState('failed');
    }
  }
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    const root = rootRef.current;
    if (largeRef.current || !('IntersectionObserver' in window)) {
      void loadRef.current();
    } else if (root) {
      const observer = new IntersectionObserver(entries => {
        if (!entries.some(entry => entry.isIntersecting)) return;
        observer.disconnect();
        observerRef.current = null;
        void loadRef.current();
      }, { rootMargin: '200px' });
      observerRef.current = observer;
      observer.observe(root);
    }
    return () => {
      requestRef.current += 1;
      observerRef.current?.disconnect();
      observerRef.current = null;
      release();
    };
    // Loads once when the preview opens, matching onMounted.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // A file that is already loading or shown is loaded again. One still waiting for the observer keeps waiting.
  const propsMounted = useRef(false);
  useEffect(() => {
    if (!propsMounted.current) {
      propsMounted.current = true;
      return;
    }
    if (stateRef.current !== 'idle') void loadRef.current();
  }, [file, revision]);

  function input(event: ChangeEvent<HTMLInputElement>) {
    const value = event.target.value;
    setTyped(value);
    onTextChange?.(value);
  }

  const icon = state === 'loading' ? 'mdi-loading mdi-spin' : state === 'failed' ? 'mdi-alert-circle-outline' : 'mdi-format-font';

  return (
    <div ref={rootRef} className={classes('font-preview', { 'is-large': large })}>{state === 'ready' && !large ? (
        <><span className="font-preview-glyphs" style={fontStyle}>{first.pair}</span><span className="font-preview-line" style={fontStyle} dir="auto">{first.text}</span></>
      ) : state === 'ready' ? (
        <div className="font-preview-specimen">
          <p className="font-specimen-title" style={fontStyle}>{title}</p>
          {latin ? ALPHABETS.map(line => <p key={line} className="font-specimen-alphabet" style={fontStyle}>{line}</p>) : null}
          {others.map(sample => (
            <section key={sample.script} className="font-specimen-sample">
              <small>{sample.script}</small>
              <p style={fontStyle} dir="auto">{sample.text}</p>
            </section>
          ))}
          {!samples.length ? <p className="font-specimen-note">The font has none of the sample texts; the declared characters are below.</p> : null}

          <label className="font-preview-label">
            <span>Text for the sizes below</span>
            <input type="text" className="form-control form-control-sm" value={typed} placeholder={first.text} aria-label={`Text to draw with ${name}`} onChange={input} />
          </label>
          <div className="font-specimen-waterfall">
            {sizes.map(pixels => (
              <p key={pixels} className={classes({ 'is-declared': pixels === size })}><small>{pixels}{pixels === size ? ' px, declared' : null}</small><span style={{ ...fontStyle, fontSize: `${pixels}px` }} dir="auto">{typed || first.text}</span></p>
            ))}
          </div>

          {ranges.length ? (
            <>
              <h6 className="font-specimen-heading">Declared characters</h6>
              {ranges.map(range => (
                <section key={range.label} className="font-preview-range">
                  <small>{range.label}{range.count > range.points.length ? ` · the first ${number(range.points.length)} of ${number(range.count)}` : null}</small>
                  <p style={{ ...fontStyle, fontSize: `${Math.min(48, Math.max(18, size || 28))}px` }}>{range.points.map(point => (
                    <span key={point} className={classes({ 'is-missing': missingSet.has(point) })} title={missingSet.has(point) ? `${codePoint(point)} is not in the font` : codePoint(point)}>{String.fromCodePoint(point)}</span>
                  ))}</p>
                </section>
              ))}
            </>
          ) : null}
        </div>
      ) : (
        <div className="font-preview-state"><i aria-hidden="true" className={classes('mdi', icon)} />{state === 'large' ? <span>{fileSize(bytes)} font <button type="button" className="btn btn-link btn-sm p-0" onClick={event => { event.stopPropagation(); void load(true); }}>Load preview</button></span>
          : state === 'failed' ? <span>{error}</span>
            : state === 'loading' ? <span>Loading the font…</span>
              : null}</div>
      )}
    </div>
  );
}
