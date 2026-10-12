import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react';
import { classes } from '../classes';
import { number, plural, viewRenderURL, viewSummary } from '../format';
import type { ViewElement, ViewFacts, ViewLayer, ViewLayout } from '../types';
import { openViewElement, saveViewPositions } from '../workspace';
import CheckBox from './CheckBox';
import NumberScrub from './NumberScrub';
import ViewRender from './ViewRender';

// Whether the names of text elements are hidden, whether Text elements draw a sample text, and the one they draw (empty
// for the one that suits each font), kept for every view the details show.
type TextPreviewSettings = { hideTextNames: boolean; drawTexts: boolean; sampleText: string };
let textPreviewSettings: TextPreviewSettings = { hideTextNames: false, drawTexts: true, sampleText: '' };
const textPreviewListeners = new Set<() => void>();
function subscribeTextPreview(listener: () => void) {
  textPreviewListeners.add(listener);
  return () => { textPreviewListeners.delete(listener); };
}
function getTextPreview() {
  return textPreviewSettings;
}
function setTextPreview(patch: Partial<TextPreviewSettings>) {
  textPreviewSettings = { ...textPreviewSettings, ...patch };
  for (const listener of [...textPreviewListeners]) listener();
}

type MoveChange = { key: string; before?: [number, number] };
type Drag = {
  layer: number; element: ViewElement; start: DOMPoint; client: [number, number]; origin: [number, number]; pointer: number; moved: boolean;
};

// A view, a .json file of a game's v folder, as the game's view elements draw it: the backend composes its elements
// into an image of the view's screen (GET /api/rss-sync/preview with a width), over a checkerboard where the view is
// transparent. A card shows a small render of the part of the screen the view draws on. A large preview shows the view
// at its own width, with the areas of the texts that the game fills in outlined with their ids, Elements to outline every
// element (dummies as crosses, the touch areas of buttons dashed, elements that draw nothing in red), Hidden elements to
// draw the hidden ones too, Hide text names to outline the texts' areas without their names (one picked in the list
// keeps its name), and the list of elements, which outlines the one clicked. The elements come from GET
// /api/rss-sync/view. With layers, a large preview draws several views on one screen, as the game shows them together:
// each view's render over the one before, the first at the bottom. Each view can be hidden or moved up and down, and
// has its own list of elements; an element's tooltip names its view. A large preview plays the Anims whose image sequence
// has more than one frame, with ViewRender, which Pause stops and Replay plays again from their first frames. Text
// elements draw a sample text in their style's font and size, as the game fills theirs in at runtime: by default the one
// that suits the font (an amount, or a count in a font of digits alone), or the one typed in Sample text; Texts turns
// them off.
// An editable preview moves elements: dragged on the screen (with Shift, only across or only up and down; the element
// picked in the list is dragged where it is under the pointer, though another is drawn over it), or by their x and y in
// the list, typed, stepped with Up and Down, or dragged. Moved elements are drawn where they are moved to, outlined and
// marked in the list; Undo (Ctrl+Z) takes back the last change, Discard all of them, and Save writes them into the views'
// files. dirty tells whether there are moves to save.
export default function ViewPreview({
  file, name, revision, facts, large = false, layers, editable = false, onDirty,
}: {
  /** The view's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  facts: ViewFacts;
  large?: boolean;
  /** Several views to draw on one screen, the first at the bottom; a large preview draws them instead of the view. */
  layers?: ViewLayer[];
  /** Whether a large preview moves the elements of its views and saves them in their files. */
  editable?: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const CARD_WIDTH = 640;
  const { hideTextNames, drawTexts, sampleText } = useSyncExternalStore(subscribeTextPreview, getTextPreview, getTextPreview);
  // The sample text drawn, once typing pauses, so that every key does not draw the views again.
  const [sample, setSample] = useState(sampleText);
  useEffect(() => {
    if (sample === sampleText) return;
    const timer = window.setTimeout(() => setSample(sampleText), 350);
    return () => window.clearTimeout(timer);
  }, [sampleText, sample]);

  const [failed, setFailed] = useState<Set<string>>(() => new Set());
  const [hidden, setHidden] = useState(false);
  const [outlines, setOutlines] = useState(false);
  /** The element picked in a list or on the screen, by its view and index. */
  const [picked, setPicked] = useState<string | null>(null);
  const keyOf = (layer: number, element: ViewElement) => `${layer}:${element.index}`;
  // The elements moved and not saved yet, by their view and index, with where they are moved to; and the changes, the
  // latest last, each with where its element was before it.
  const [moves, setMoves] = useState<Record<string, [number, number]>>({});
  const [history, setHistory] = useState<MoveChange[]>([]);
  const movesRef = useRef(moves);
  const historyRef = useRef(history);

  // The views drawn, in drawing order, and those hidden.
  const stack = useMemo<ViewLayer[]>(() => layers ?? [{ file, name, facts }], [layers, file, name, facts]);
  const many = stack.length > 1;
  const [order, setOrder] = useState<number[]>(() => stack.map((_layer, index) => index));
  const [off, setOff] = useState<Set<number>>(() => new Set());
  const [stackSeen, setStackSeen] = useState(stack);
  if (stackSeen !== stack) {
    setStackSeen(stack);
    setOrder(stack.map((_layer, index) => index));
    setOff(new Set());
  }
  const shown = order.flatMap(index => {
    const layer = stack[index];
    return layer && !off.has(index) ? [{ index, layer }] : [];
  });
  // The screen fits every view, each drawn from its top left corner at its own resolution.
  const resolution = {
    width: Math.max(...stack.map(layer => layer.facts.resolution.width)),
    height: Math.max(...stack.map(layer => layer.facts.resolution.height)),
  };
  const mixed = new Set(stack.map(layer => `${layer.facts.resolution.width}x${layer.facts.resolution.height}`)).size > 1;
  const cardSource = viewRenderURL(file, revision, CARD_WIDTH, false, true);
  const textParam = !drawTexts ? '' : sample.trim() ? sample : undefined;
  const [playing, setPlaying] = useState(true);
  const [restart, setRestart] = useState(0);
  const placed = (layer: ViewLayer): CSSProperties => ({
    width: `${100 * layer.facts.resolution.width / resolution.width}%`,
    height: `${100 * layer.facts.resolution.height / resolution.height}%`,
  });
  const failedKey = `${file}\0${revision}\0${hidden}`;
  const [failedKeySeen, setFailedKeySeen] = useState(failedKey);
  if (failedKeySeen !== failedKey) {
    setFailedKeySeen(failedKey);
    setFailed(new Set());
  }
  function markFailed(target: string) {
    setFailed(current => {
      if (current.has(target)) return current;
      const next = new Set(current);
      next.add(target);
      return next;
    });
  }

  // The layer list shows the view drawn on top first: each with its place in the drawing order.
  const layerRows = order.flatMap((index, position) => (stack[index] ? [{ index, position, layer: stack[index] }] : [])).reverse();
  /** Move a view one place up (later, over the others) or down in the drawing order. */
  function move(position: number, step: -1 | 1) {
    setOrder(current => {
      const next = [...current];
      [next[position], next[position + step]] = [next[position + step], next[position]];
      return next;
    });
  }

  const [layouts, setLayouts] = useState<(ViewLayout | null)[]>([]);
  const layoutsRef = useRef(layouts);
  const [errors, setErrors] = useState<string[]>([]);
  const [state, setState] = useState<'loading' | 'ready' | 'failed'>('loading');
  const requestRef = useRef(0);
  /** Read the views' elements; quietly, the elements shown stay until the new ones are read. */
  async function load(quiet = false) {
    const id = ++requestRef.current;
    if (!quiet) setState('loading');
    const text = textParam !== undefined ? `&text=${encodeURIComponent(textParam)}` : '';
    const results = await Promise.all(stack.map(async layer => {
      try {
        const response = await fetch(`/api/rss-sync/view?file=${encodeURIComponent(layer.file)}&v=${encodeURIComponent(revision)}${text}`);
        const body = await response.json().catch(() => null) as { error?: string } | null;
        if (!response.ok || !body) throw new Error(body?.error || 'The elements could not be loaded');
        return { layout: body as ViewLayout, error: '' };
      } catch (e) {
        return { layout: null, error: `${many ? `${layer.name}: ` : ''}${(e as Error).message}` };
      }
    }));
    if (id !== requestRef.current) return;
    const nextLayouts = results.map(result => result.layout);
    layoutsRef.current = nextLayouts;
    setLayouts(nextLayouts);
    setErrors(results.map(result => result.error).filter(error => error.length > 0));
    setState(results.some(result => result.layout) ? 'ready' : 'failed');
  }
  useLayoutEffect(() => {
    setPicked(null);
    movesRef.current = {};
    historyRef.current = [];
    setMoves({});
    setHistory([]);
    if (large) void load(false);
    // Reload only when the views being drawn change. `load` closes over this render's sample text.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [large, stack, revision]);
  const textSeen = useRef(textParam);
  useEffect(() => {
    if (Object.is(textSeen.current, textParam)) return;
    textSeen.current = textParam;
    if (large) void load(true);
    // Another sample text keeps the moves; it does not reset them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [textParam, large]);

  const elementsOf = (index: number) => layouts[index]?.elements ?? [];

  const [saving, setSaving] = useState(false);
  const movedCount = Object.keys(moves).length;
  const movedBefore = useRef(0);
  useEffect(() => {
    if (!movedCount !== !movedBefore.current) onDirty?.(movedCount > 0);
    movedBefore.current = movedCount;
  }, [movedCount, onDirty]);
  const positionOf = (layer: number, element: ViewElement) => moves[keyOf(layer, element)] ?? element.position;
  const offsetOf = (layer: number, element: ViewElement): [number, number] => {
    const [x, y] = positionOf(layer, element);
    return [x - element.position[0], y - element.position[1]];
  };
  const shifted = (layer: number, element: ViewElement, corners: [number, number][]) => {
    const [dx, dy] = offsetOf(layer, element);
    return dx || dy ? corners.map(([x, y]) => [x + dx, y + dy] as [number, number]) : corners;
  };
  /** How far each moved element of a view is moved, by its index, for ViewRender to draw it there. */
  const movesOf = (layer: number) => Object.fromEntries(elementsOf(layer).filter(element => moves[keyOf(layer, element)])
    .map(element => [element.index, offsetOf(layer, element)])) as Record<number, [number, number]>;
  function setPosition(layer: number, element: ViewElement, position: [number, number]) {
    const key = keyOf(layer, element);
    const next = { ...movesRef.current };
    if (position[0] === element.position[0] && position[1] === element.position[1]) delete next[key];
    else next[key] = position;
    movesRef.current = next;
    setMoves(next);
  }
  /** Start a change of an element's position, which Undo takes back as a whole, and pick the element. */
  function beginChange(layer: number, element: ViewElement) {
    const key = keyOf(layer, element);
    historyRef.current = [...historyRef.current, { key, before: movesRef.current[key] }];
    setHistory(historyRef.current);
    setPicked(key);
  }
  const undo = useCallback(() => {
    const stackHistory = historyRef.current;
    const last = stackHistory[stackHistory.length - 1];
    if (!last) return;
    historyRef.current = stackHistory.slice(0, -1);
    setHistory(historyRef.current);
    const next = { ...movesRef.current };
    if (last.before) next[last.key] = last.before;
    else delete next[last.key];
    movesRef.current = next;
    setMoves(next);
  }, []);
  function discard() {
    movesRef.current = {};
    historyRef.current = [];
    setMoves({});
    setHistory([]);
  }
  /** Write each view's moved elements into its file, one view after another; a view that cannot be saved keeps them. */
  async function save() {
    setSaving(true);
    try {
      for (const [layer, view] of stack.entries()) {
        const layout = layoutsRef.current[layer];
        const currentMoves = movesRef.current;
        const keys = Object.keys(currentMoves).filter(key => key.startsWith(`${layer}:`));
        if (!keys.length || !layout?.revision) continue;
        const positions = keys.map(key => ({ index: Number(key.split(':')[1]), x: currentMoves[key][0], y: currentMoves[key][1] }));
        const next = await saveViewPositions(view.file, view.name, layout.revision, positions);
        if (!next) return;
        const nextLayouts = [...layoutsRef.current];
        nextLayouts[layer] = next;
        layoutsRef.current = nextLayouts;
        setLayouts(nextLayouts);
        const kept = { ...movesRef.current };
        for (const key of keys) delete kept[key];
        movesRef.current = kept;
        setMoves(kept);
        historyRef.current = historyRef.current.filter(item => !item.key.startsWith(`${layer}:`));
        setHistory(historyRef.current);
      }
    } finally { setSaving(false); }
  }
  useEffect(() => {
    function onKeydown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (!large || !editable || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
      if (target?.closest('input, textarea')) return;
      event.preventDefault();
      undo();
    }
    document.addEventListener('keydown', onKeydown);
    return () => document.removeEventListener('keydown', onKeydown);
  }, [large, editable, undo]);

  // Dragging an element on the screen, in the screen's coordinates; a press that does not move picks it.
  const overlayRef = useRef<SVGSVGElement>(null);
  const DRAG_THRESHOLD = 3;
  const dragRef = useRef<Drag | null>(null);
  function screenPoint(event: { clientX: number; clientY: number }) {
    const svg = overlayRef.current!;
    return new DOMPoint(event.clientX, event.clientY).matrixTransform(svg.getScreenCTM()!.inverse());
  }
  /** Whether a point is inside a polygon. */
  function inside([x, y]: [number, number], polygon: [number, number][]) {
    let result = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const [xi, yi] = polygon[i];
      const [xj, yj] = polygon[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) result = !result;
    }
    return result;
  }
  function pointerDown(event: ReactPointerEvent<SVGGElement>, layer: number, element: ViewElement) {
    if (!editable || event.button !== 0) return;
    const start = screenPoint(event);
    let target = { layer, element };
    // The element picked in the list is dragged where it is under the pointer, though another is drawn over it.
    if (picked && picked !== keyOf(layer, element)) {
      const [pickedLayer, pickedIndex] = picked.split(':').map(Number);
      const candidate = elementsOf(pickedLayer)[pickedIndex];
      if (candidate && hasArea(candidate) && inside([start.x, start.y], shifted(pickedLayer, candidate, candidate.corners))) target = { layer: pickedLayer, element: candidate };
    }
    dragRef.current = { ...target, start, client: [event.clientX, event.clientY], origin: movesRef.current[keyOf(target.layer, target.element)] ?? target.element.position, pointer: event.pointerId, moved: false };
    (event.currentTarget as Element).setPointerCapture(event.pointerId);
    event.preventDefault();
  }
  function pointerMove(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointer) return;
    if (!drag.moved) {
      if (Math.abs(event.clientX - drag.client[0]) < DRAG_THRESHOLD && Math.abs(event.clientY - drag.client[1]) < DRAG_THRESHOLD) return;
      drag.moved = true;
      beginChange(drag.layer, drag.element);
    }
    const point = screenPoint(event);
    let dx = Math.round(point.x - drag.start.x);
    let dy = Math.round(point.y - drag.start.y);
    // With Shift, only across or only up and down, whichever is moved more.
    if (event.shiftKey) {
      if (Math.abs(dx) >= Math.abs(dy)) dy = 0;
      else dx = 0;
    }
    setPosition(drag.layer, drag.element, [drag.origin[0] + dx, drag.origin[1] + dy]);
  }
  function pointerUp(event: ReactPointerEvent<SVGSVGElement>) {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointer) return;
    dragRef.current = null;
    if (!drag.moved) pick(drag.layer, drag.element);
  }
  function cancelDrag() { dragRef.current = null; }
  /** Whether an element can be dragged on the screen: one that is drawn there, the hidden ones only when they are. */
  const draggable = (element: ViewElement) => !(element.hidden && !hidden && element.type !== 'Dummy');
  /** How many Anims of the views shown play: those with an image sequence of more than one frame. */
  const animations = shown.reduce((sum, { index }) => sum + elementsOf(index)
    .filter(element => element.type === 'Anim' && element.drawn && (element.frames ?? 0) > 1 && (hidden || !element.hidden)).length, 0);
  const totals = {
    elements: stack.reduce((sum, layer) => sum + layer.facts.elements, 0),
    hidden: stack.reduce((sum, layer) => sum + layer.facts.hidden, 0),
    missing: stack.reduce((sum, layer) => sum + layer.facts.missingCount, 0),
    texts: stack.some(layer => layer.facts.types.Text),
  };
  const points = (corners: [number, number][]) => corners.map(([x, y]) => `${x},${y}`).join(' ');
  const hasArea = (element: ViewElement) => element.size[0] > 0 && element.size[1] > 0;
  /** Whether an element is outlined: a text's area always, every element with Elements, and the one picked. */
  function outlined(layer: number, element: ViewElement) {
    if (keyOf(layer, element) === picked) return true;
    if (element.hidden && !hidden && element.type !== 'Dummy') return false;
    return outlines || element.type === 'Text';
  }
  function kindOf(element: ViewElement) {
    if (element.reason && !element.movie) return 'is-missing';
    if (element.type === 'Text') return 'is-text';
    if (element.type === 'Dummy') return 'is-dummy';
    return element.drawn ? 'is-drawn' : 'is-empty';
  }
  /** What an element draws, or why it draws nothing, as the list and the outlines' tooltips say it. */
  function describe(element: ViewElement) {
    if (element.reason) return element.reason;
    if (element.runtime) return 'an image the game sets';
    if (element.touchOnly) return 'a touch area';
    if (element.type === 'Text') {
      return [element.style, element.fontId, element.fontSize ? `${element.fontSize} px` : '',
        element.text ? `a text the game fills in, drawn with “${element.text.sample}”` : 'a text the game fills in'].filter(Boolean).join(' · ');
    }
    if (element.type === 'Dummy') return 'a hidden point';
    if (element.frames) {
      const loops = element.loopCount ?? 1;
      const plays = element.frames < 2 ? 'one frame' : loops === 0 ? 'repeats forever' : loops === 1 ? 'plays once' : `plays ${number(loops)} times`;
      return `${number(element.frames)} frame${plural(element.frames)}${element.frameTime ? ` every ${element.frameTime} ms` : ''}, ${plays}`;
    }
    if (element.page) return `RTF page ${element.page}`;
    return element.drawn ? `${Math.round(element.size[0])} × ${Math.round(element.size[1])}` : '—';
  }
  const titleOf = (layer: ViewLayer, element: ViewElement) => [many ? layer.name : '', element.id || `#${element.index}`, element.type, element.keys.join(', '), describe(element)]
    .filter(Boolean).join(' · ');
  const labelAt = (layer: number, element: ViewElement) => shifted(layer, element, element.corners)[0];
  /** Whether an element's name is drawn: a text's unless text names are hidden, any with Elements, and the one picked. */
  const labelled = (layer: number, element: ViewElement) => keyOf(layer, element) === picked
    || (element.type === 'Text' ? !hideTextNames : outlines);
  const pick = (layer: number, element: ViewElement) => { setPicked(keyOf(layer, element) === picked ? null : keyOf(layer, element)); };
  // Labels are drawn at a size that stays readable when the screen is scaled down to fit.
  const labelSize = Math.max(14, resolution.width / 90);

  if (!large) {
    return (
      <div className="view-preview">
        <div className="thumbnail view-preview-screen">
          {!failed.has(file) ? (
            <img src={cardSource} alt={`${name}, a view of ${facts.resolution.width} × ${facts.resolution.height}`} loading="lazy" onError={() => markFailed(file)} />
          ) : (
            <div className="generic-preview view"><i aria-hidden="true" className="mdi mdi-view-dashboard-outline" /><small>The view cannot be drawn</small></div>
          )}
          <span className="badge file-format">VIEW</span>
          <span className="view-preview-caption">{facts.resolution.width} × {facts.resolution.height} · {number(facts.elements)} element{plural(facts.elements)}</span>
        </div>
      </div>
    );
  }
  return (
    <div className="view-viewer">
      <div className="view-viewer-toolbar">
        <CheckBox checked={outlines} label="Outline every element" onChange={setOutlines}>Elements</CheckBox>
        {totals.texts ? <CheckBox checked={hideTextNames} label="Hide the names of text elements" onChange={checked => setTextPreview({ hideTextNames: checked })}>Hide text names</CheckBox> : null}
        {totals.texts ? <CheckBox checked={drawTexts} label="Draw a sample text in the text elements" onChange={checked => setTextPreview({ drawTexts: checked })}>Texts</CheckBox> : null}
        {totals.texts ? (
          <label className="view-viewer-sample" title="The text that Text elements draw, as the game fills theirs in at runtime; empty draws the one that suits each font">
            <span>Sample text</span>
            <input value={sampleText} type="text" className="form-control form-control-sm" maxLength={200} aria-label="Sample text of the text elements"
                   placeholder="1 234.56 or 10" disabled={!drawTexts} onChange={event => setTextPreview({ sampleText: event.target.value })} />
          </label>
        ) : null}
        <CheckBox checked={hidden} label="Draw the hidden elements" onChange={setHidden}>
          Hidden elements{totals.hidden ? <small className="text-muted"> ({number(totals.hidden)})</small> : null}
        </CheckBox>
        {animations ? (
          <span className="view-viewer-play" role="group" aria-label="Animations">
            <button type="button" className="btn btn-outline-secondary btn-sm" aria-pressed={!playing} onClick={() => setPlaying(value => !value)}>
              <i aria-hidden="true" className={classes('mdi', playing ? 'mdi-pause' : 'mdi-play')} />{playing ? 'Pause' : 'Play'}
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" title="Play every animation again from its first frame" onClick={() => { setRestart(value => value + 1); setPlaying(true); }}>
              <i aria-hidden="true" className="mdi mdi-replay" />Replay
            </button>
            <small className="text-muted">{number(animations)} animation{plural(animations)}</small>
          </span>
        ) : null}
        {editable && state === 'ready' ? (
          <span className="view-viewer-edit" role="group" aria-label="Moved elements">
            {movedCount ? (
              <>
                <span className="view-viewer-moved">{number(movedCount)} element{plural(movedCount)} moved</span>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={!history.length || saving} title="Take back the last change (Ctrl+Z)" onClick={undo}><i aria-hidden="true" className="mdi mdi-undo" />Undo</button>
                <button type="button" className="btn btn-outline-secondary btn-sm" disabled={saving} onClick={discard}><i aria-hidden="true" className="mdi mdi-close" />Discard</button>
                <button type="button" className="btn btn-primary btn-sm" disabled={saving} title={`Write the new positions into ${many ? "the views' files" : `${name}'s file`}`} onClick={() => void save()}>
                  <i aria-hidden="true" className={classes('mdi', saving ? 'mdi-loading mdi-spin' : 'mdi-content-save-outline')} />Save
                </button>
              </>
            ) : <small className="text-muted">Drag an element, or its x and y in the list, to move it</small>}
          </span>
        ) : null}
        <span className="view-viewer-summary text-muted">{many ? `${number(stack.length)} views · ${number(totals.elements)} elements` : viewSummary(facts)}</span>
        {totals.missing ? <span className="view-viewer-missing"><i aria-hidden="true" className="mdi mdi-alert-outline" />{number(totals.missing)} element{plural(totals.missing)} without {totals.missing === 1 ? 'its resource' : 'their resources'}</span> : null}
      </div>
      {many ? (
        <ol className="view-layers" aria-label="Views, the one drawn on top first">
          {layerRows.map(row => (
            <li key={row.layer.file} className={classes({ 'is-off': off.has(row.index) })}
                title={`${row.layer.name}: layer ${row.position + 1}, ${row.layer.facts.resolution.width} × ${row.layer.facts.resolution.height}, ${number(row.layer.facts.elements)} element${plural(row.layer.facts.elements)}`}>
              <CheckBox checked={!off.has(row.index)} label={`Show ${row.layer.name}`} onChange={checked => {
                setOff(current => {
                  const next = new Set(current);
                  if (checked) next.delete(row.index);
                  else next.add(row.index);
                  return next;
                });
              }}>
                <span className="details-code">{row.layer.name}</span>
              </CheckBox>
              <span className="view-layer-moves">
                <button type="button" className="details-icon" disabled={row.position === order.length - 1} aria-label={`Draw ${row.layer.name} higher`} title="Draw higher" onClick={() => move(row.position, 1)}><i aria-hidden="true" className="mdi mdi-arrow-up" /></button>
                <button type="button" className="details-icon" disabled={row.position === 0} aria-label={`Draw ${row.layer.name} lower`} title="Draw lower" onClick={() => move(row.position, -1)}><i aria-hidden="true" className="mdi mdi-arrow-down" /></button>
              </span>
            </li>
          ))}
        </ol>
      ) : null}
      {many && mixed ? <p className="view-viewer-note text-muted">The views have different resolutions: each is drawn from the top left corner of the screen.</p> : null}
      <div className="view-stage" style={{ aspectRatio: `${resolution.width} / ${resolution.height}`, maxWidth: `calc(58vh * ${resolution.width} / ${resolution.height})` }}>
        {shown.map(({ index, layer }) => !failed.has(layer.file) ? (
          <ViewRender key={layer.file} style={placed(layer)} file={layer.file} name={layer.name} revision={revision} resolution={layer.facts.resolution}
                      hidden={hidden} layout={layouts[index] ?? null} playing={playing} restart={restart} moves={movesOf(index)} text={textParam}
                      onError={() => markFailed(layer.file)} />
        ) : (
          <p key={layer.file} className="view-stage-state text-danger"><i aria-hidden="true" className="mdi mdi-alert-circle-outline" />{many ? `${layer.name} cannot be drawn` : 'The view cannot be drawn'}</p>
        ))}
        {state === 'ready' ? (
          <svg ref={overlayRef} className={classes('view-stage-overlay', { 'is-editable': editable })} viewBox={`0 0 ${resolution.width} ${resolution.height}`} preserveAspectRatio="none"
               role="group" aria-label={`Elements of ${many ? `${stack.length} views` : name}`} style={{ '--view-label': `${labelSize}px` } as CSSProperties}
               onPointerMove={pointerMove} onPointerUp={pointerUp} onPointerCancel={cancelDrag}>
            {shown.map(({ index, layer }) => (
              <g key={layer.file} data-view={layer.name}>
                {/* An editable preview keeps every element that is drawn there under the pointer, outlined or not, to drag it. */}
                {elementsOf(index).map(element => {
                  const visible = outlined(index, element) || (editable && draggable(element));
                  return (
                    <g key={element.index} style={{ display: visible ? undefined : 'none' }}
                       className={classes('view-element', kindOf(element), { 'is-picked': keyOf(index, element) === picked, 'is-quiet': !outlined(index, element), 'is-moved': !!moves[keyOf(index, element)] })}
                       data-element={element.id} onClick={() => { if (!editable) pick(index, element); }} onPointerDown={event => pointerDown(event, index, element)}>
                      <title>{titleOf(layer, element)}</title>
                      {hasArea(element) ? <polygon points={points(shifted(index, element, element.corners))} /> : null}
                      {element.touchArea && (outlines || keyOf(index, element) === picked) ? <polygon className="view-touch" points={points(shifted(index, element, element.touchArea))} /> : null}
                      {!hasArea(element) ? <path d={`M${positionOf(index, element)[0] - 12},${positionOf(index, element)[1]}h24M${positionOf(index, element)[0]},${positionOf(index, element)[1] - 12}v24`} className="view-point" /> : null}
                      {labelled(index, element) ? <text x={labelAt(index, element)[0] + 4} y={labelAt(index, element)[1] + labelSize + 2}>{element.id || element.type}</text> : null}
                    </g>
                  );
                })}
              </g>
            ))}
          </svg>
        ) : state === 'loading' ? (
          <p className="view-stage-state text-muted"><i aria-hidden="true" className="mdi mdi-loading mdi-spin" />Loading the elements…</p>
        ) : null}
      </div>
      {errors.map(message => <p key={message} className="text-danger view-viewer-error">{message}</p>)}
      {stack.map((layer, index) => elementsOf(index).length ? (
        <details key={layer.file} className="view-elements">
          <summary>{many ? `${layer.name}: ` : ''}{number(elementsOf(index).length)} element{plural(elementsOf(index).length)}, drawn in this order</summary>
          <table className="table table-sm">
            <thead><tr><th scope="col">#</th><th scope="col">Id</th><th scope="col">Type</th><th scope="col">Resource</th><th scope="col">Position</th><th scope="col">Draws</th></tr></thead>
            <tbody>
              {elementsOf(index).map(element => (
                <tr key={element.index}
                    className={classes({ 'is-picked': keyOf(index, element) === picked, 'is-missing': !!(element.reason && !element.movie), 'is-moved': !!moves[keyOf(index, element)] })}
                    onClick={() => pick(index, element)}>
                  <td><button type="button" className="details-icon view-element-open" aria-label={`Open ${element.id || `element ${element.index + 1}`} in VS Code`} title={`Open in VS Code: ${layer.name}, ${element.id || `element ${element.index + 1}`}`} onClick={event => { event.stopPropagation(); void openViewElement(layer.file, element.index); }}>{`{${element.index + 1}}`}</button></td>
                  <td className="details-code">{element.id}{element.hidden && element.type !== 'Dummy' ? <small className="text-muted"> hidden</small> : null}</td>
                  <td>{element.type}</td>
                  <td className="details-code" title={element.file}>{element.keys.join(', ') || '—'}</td>
                  {editable ? (
                    <td className="view-element-position">
                      <NumberScrub axis="x" value={positionOf(index, element)[0]} label={`x of ${element.id || `element ${element.index + 1}`}`}
                                   onBegin={() => beginChange(index, element)} onChange={value => setPosition(index, element, [value, positionOf(index, element)[1]])} />,{' '}
                      <NumberScrub axis="y" value={positionOf(index, element)[1]} label={`y of ${element.id || `element ${element.index + 1}`}`}
                                   onBegin={() => beginChange(index, element)} onChange={value => setPosition(index, element, [positionOf(index, element)[0], value])} />
                    </td>
                  ) : <td className="text-muted">{Math.round(element.position[0])}, {Math.round(element.position[1])}</td>}
                  <td>{describe(element)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      ) : null)}
    </div>
  );
}
