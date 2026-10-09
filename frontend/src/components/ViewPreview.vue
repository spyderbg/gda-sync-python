<script lang="ts">
import { ref } from 'vue';

// Whether the names of text elements are hidden, kept for every view the details show.
const hideTextNames = ref(false);
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, watch } from 'vue';
import { number, plural, viewRenderURL, viewSummary } from '../format';
import type { ViewElement, ViewFacts, ViewLayer, ViewLayout } from '../types';
import { openViewElement, saveViewPositions } from '../workspace';
import CheckBox from './CheckBox.vue';
import NumberScrub from './NumberScrub.vue';
import ViewRender from './ViewRender.vue';

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
// has more than one frame, with ViewRender, which Pause stops and Replay plays again from their first frames.
// An editable preview moves elements: dragged on the screen (with Shift, only across or only up and down; the element
// picked in the list is dragged where it is under the pointer, though another is drawn over it), or by their x and y in
// the list, typed, stepped with Up and Down, or dragged. Moved elements are drawn where they are moved to, outlined and
// marked in the list; Undo (Ctrl+Z) takes back the last change, Discard all of them, and Save writes them into the views'
// files. dirty tells whether there are moves to save.
const props = withDefaults(defineProps<{
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
}>(), { large: false, layers: undefined, editable: false });
const emit = defineEmits<{ dirty: [boolean] }>();

const CARD_WIDTH = 640;
const failed = reactive(new Set<string>());
const hidden = ref(false);
const outlines = ref(false);
/** The element picked in a list or on the screen, by its view and index. */
const picked = ref<string | null>(null);
const keyOf = (layer: number, element: ViewElement) => `${layer}:${element.index}`;
// The elements moved and not saved yet, by their view and index, with where they are moved to; and the changes, the
// latest last, each with where its element was before it.
const moves = ref<Record<string, [number, number]>>({});
const history = ref<{ key: string; before?: [number, number] }[]>([]);

// The views drawn, in drawing order, and those hidden.
const stack = computed<ViewLayer[]>(() => props.layers ?? [{ file: props.file, name: props.name, facts: props.facts }]);
const many = computed(() => stack.value.length > 1);
const order = ref<number[]>([]);
const off = reactive(new Set<number>());
watch(stack, layers => {
  order.value = layers.map((_layer, index) => index);
  off.clear();
}, { immediate: true });
const shown = computed(() => order.value.filter(index => !off.has(index)).map(index => ({ index, layer: stack.value[index] })));
// The screen fits every view, each drawn from its top left corner at its own resolution.
const resolution = computed(() => ({
  width: Math.max(...stack.value.map(layer => layer.facts.resolution.width)),
  height: Math.max(...stack.value.map(layer => layer.facts.resolution.height)),
}));
const mixed = computed(() => new Set(stack.value.map(layer => `${layer.facts.resolution.width}x${layer.facts.resolution.height}`)).size > 1);
const cardSource = computed(() => viewRenderURL(props.file, props.revision, CARD_WIDTH, false, true));
const playing = ref(true);
const restart = ref(0);
const placed = (layer: ViewLayer) => ({
  width: `${100 * layer.facts.resolution.width / resolution.value.width}%`,
  height: `${100 * layer.facts.resolution.height / resolution.value.height}%`,
});
watch(() => [props.file, props.revision, hidden.value], () => { failed.clear(); });

// The layer list shows the view drawn on top first: each with its place in the drawing order.
const layerRows = computed(() => order.value.map((index, position) => ({ index, position, layer: stack.value[index] })).reverse());
/** Move a view one place up (later, over the others) or down in the drawing order. */
function move(position: number, step: -1 | 1) {
  const next = [...order.value];
  [next[position], next[position + step]] = [next[position + step], next[position]];
  order.value = next;
}

const layouts = ref<(ViewLayout | null)[]>([]);
const errors = ref<string[]>([]);
const state = ref<'loading' | 'ready' | 'failed'>('loading');
let request = 0;
async function load() {
  const id = ++request;
  state.value = 'loading';
  const results = await Promise.all(stack.value.map(async layer => {
    try {
      const response = await fetch(`/api/rss-sync/view?file=${encodeURIComponent(layer.file)}&v=${encodeURIComponent(props.revision)}`);
      const body = await response.json().catch(() => null);
      if (!response.ok || !body) throw new Error(body?.error || 'The elements could not be loaded');
      return { layout: body as ViewLayout, error: '' };
    } catch (e) {
      return { layout: null, error: `${many.value ? `${layer.name}: ` : ''}${(e as Error).message}` };
    }
  }));
  if (id !== request) return;
  layouts.value = results.map(result => result.layout);
  errors.value = results.map(result => result.error).filter(Boolean);
  state.value = results.some(result => result.layout) ? 'ready' : 'failed';
}
watch(() => [props.large, stack.value, props.revision], () => {
  picked.value = null;
  moves.value = {};
  history.value = [];
  if (props.large) void load();
}, { immediate: true });

const elementsOf = (index: number) => layouts.value[index]?.elements ?? [];

const saving = ref(false);
const movedCount = computed(() => Object.keys(moves.value).length);
watch(movedCount, (count, before) => { if (!count !== !before) emit('dirty', count > 0); });
const positionOf = (layer: number, element: ViewElement) => moves.value[keyOf(layer, element)] ?? element.position;
const offsetOf = (layer: number, element: ViewElement): [number, number] => {
  const [x, y] = positionOf(layer, element);
  return [x - element.position[0], y - element.position[1]];
};
const shifted = (layer: number, element: ViewElement, corners: [number, number][]) => {
  const [dx, dy] = offsetOf(layer, element);
  return dx || dy ? corners.map(([x, y]) => [x + dx, y + dy] as [number, number]) : corners;
};
/** How far each moved element of a view is moved, by its index, for ViewRender to draw it there. */
const movesOf = (layer: number) => Object.fromEntries(elementsOf(layer).filter(element => moves.value[keyOf(layer, element)])
  .map(element => [element.index, offsetOf(layer, element)]));
function setPosition(layer: number, element: ViewElement, position: [number, number]) {
  const key = keyOf(layer, element);
  const next = { ...moves.value };
  if (position[0] === element.position[0] && position[1] === element.position[1]) delete next[key];
  else next[key] = position;
  moves.value = next;
}
/** Start a change of an element's position, which Undo takes back as a whole, and pick the element. */
function beginChange(layer: number, element: ViewElement) {
  const key = keyOf(layer, element);
  history.value = [...history.value, { key, before: moves.value[key] }];
  picked.value = key;
}
function undo() {
  const last = history.value[history.value.length - 1];
  if (!last) return;
  history.value = history.value.slice(0, -1);
  const next = { ...moves.value };
  if (last.before) next[last.key] = last.before;
  else delete next[last.key];
  moves.value = next;
}
function discard() {
  moves.value = {};
  history.value = [];
}
/** Write each view's moved elements into its file, one view after another; a view that cannot be saved keeps them. */
async function save() {
  saving.value = true;
  try {
    for (const [layer, view] of stack.value.entries()) {
      const layout = layouts.value[layer];
      const keys = Object.keys(moves.value).filter(key => key.startsWith(`${layer}:`));
      if (!keys.length || !layout?.revision) continue;
      const positions = keys.map(key => ({ index: Number(key.split(':')[1]), x: moves.value[key][0], y: moves.value[key][1] }));
      const next = await saveViewPositions(view.file, view.name, layout.revision, positions);
      if (!next) return;
      layouts.value[layer] = next;
      const kept = { ...moves.value };
      for (const key of keys) delete kept[key];
      moves.value = kept;
      history.value = history.value.filter(item => !item.key.startsWith(`${layer}:`));
    }
  } finally { saving.value = false; }
}
function onKeydown(event: KeyboardEvent) {
  const target = event.target as HTMLElement | null;
  if (!props.large || !props.editable || !(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== 'z' || event.shiftKey) return;
  if (target?.closest('input, textarea')) return;
  event.preventDefault();
  undo();
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));

// Dragging an element on the screen, in the screen's coordinates; a press that does not move picks it.
const overlay = ref<SVGSVGElement>();
const DRAG_THRESHOLD = 3;
let drag: { layer: number; element: ViewElement; start: DOMPoint; client: [number, number]; origin: [number, number]; pointer: number; moved: boolean } | null = null;
function screenPoint(event: PointerEvent) {
  const svg = overlay.value!;
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
function pointerDown(event: PointerEvent, layer: number, element: ViewElement) {
  if (!props.editable || event.button !== 0) return;
  const start = screenPoint(event);
  let target = { layer, element };
  // The element picked in the list is dragged where it is under the pointer, though another is drawn over it.
  if (picked.value && picked.value !== keyOf(layer, element)) {
    const [pickedLayer, pickedIndex] = picked.value.split(':').map(Number);
    const candidate = elementsOf(pickedLayer)[pickedIndex];
    if (candidate && hasArea(candidate) && inside([start.x, start.y], shifted(pickedLayer, candidate, candidate.corners))) target = { layer: pickedLayer, element: candidate };
  }
  drag = { ...target, start, client: [event.clientX, event.clientY], origin: positionOf(target.layer, target.element), pointer: event.pointerId, moved: false };
  (event.currentTarget as Element).setPointerCapture(event.pointerId);
  event.preventDefault();
}
function pointerMove(event: PointerEvent) {
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
function pointerUp(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return;
  const ended = drag;
  drag = null;
  if (!ended.moved) pick(ended.layer, ended.element);
}
function cancelDrag() { drag = null; }
/** Whether an element can be dragged on the screen: one that is drawn there, the hidden ones only when they are. */
const draggable = (element: ViewElement) => !(element.hidden && !hidden.value && element.type !== 'Dummy');
/** How many Anims of the views shown play: those with an image sequence of more than one frame. */
const animations = computed(() => shown.value.reduce((sum, { index }) => sum + elementsOf(index)
  .filter(element => element.type === 'Anim' && element.drawn && (element.frames ?? 0) > 1 && (hidden.value || !element.hidden)).length, 0));
const totals = computed(() => ({
  elements: stack.value.reduce((sum, layer) => sum + layer.facts.elements, 0),
  hidden: stack.value.reduce((sum, layer) => sum + layer.facts.hidden, 0),
  missing: stack.value.reduce((sum, layer) => sum + layer.facts.missingCount, 0),
  texts: stack.value.some(layer => layer.facts.types.Text),
}));
const points = (corners: [number, number][]) => corners.map(([x, y]) => `${x},${y}`).join(' ');
const hasArea = (element: ViewElement) => element.size[0] > 0 && element.size[1] > 0;
/** Whether an element is outlined: a text's area always, every element with Elements, and the one picked. */
function outlined(layer: number, element: ViewElement) {
  if (keyOf(layer, element) === picked.value) return true;
  if (element.hidden && !hidden.value && element.type !== 'Dummy') return false;
  return outlines.value || element.type === 'Text';
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
  if (element.type === 'Text') return [element.style, element.fontSize ? `${element.fontSize} px` : '', 'a text the game fills in'].filter(Boolean).join(' · ');
  if (element.type === 'Dummy') return 'a hidden point';
  if (element.frames) {
    const loops = element.loopCount ?? 1;
    const plays = element.frames < 2 ? 'one frame' : loops === 0 ? 'repeats forever' : loops === 1 ? 'plays once' : `plays ${number(loops)} times`;
    return `${number(element.frames)} frame${plural(element.frames)}${element.frameTime ? ` every ${element.frameTime} ms` : ''}, ${plays}`;
  }
  if (element.page) return `RTF page ${element.page}`;
  return element.drawn ? `${Math.round(element.size[0])} × ${Math.round(element.size[1])}` : '—';
}
const titleOf = (layer: ViewLayer, element: ViewElement) => [many.value ? layer.name : '', element.id || `#${element.index}`, element.type, element.keys.join(', '), describe(element)]
  .filter(Boolean).join(' · ');
const labelAt = (layer: number, element: ViewElement) => shifted(layer, element, element.corners)[0];
/** Whether an element's name is drawn: a text's unless text names are hidden, any with Elements, and the one picked. */
const labelled = (layer: number, element: ViewElement) => keyOf(layer, element) === picked.value
  || (element.type === 'Text' ? !hideTextNames.value : outlines.value);
const pick = (layer: number, element: ViewElement) => { picked.value = keyOf(layer, element) === picked.value ? null : keyOf(layer, element); };
// Labels are drawn at a size that stays readable when the screen is scaled down to fit.
const labelSize = computed(() => Math.max(14, resolution.value.width / 90));
</script>

<template>
  <div v-if="!large" class="view-preview">
    <div class="thumbnail view-preview-screen">
      <img v-if="!failed.has(file)" :src="cardSource" :alt="`${name}, a view of ${facts.resolution.width} × ${facts.resolution.height}`" loading="lazy" @error="failed.add(file)">
      <div v-else class="generic-preview view"><i aria-hidden="true" class="mdi mdi-view-dashboard-outline" /><small>The view cannot be drawn</small></div>
      <span class="badge file-format">VIEW</span>
      <span class="view-preview-caption">{{ facts.resolution.width }} × {{ facts.resolution.height }} · {{ number(facts.elements) }} element{{ plural(facts.elements) }}</span>
    </div>
  </div>
  <div v-else class="view-viewer">
    <div class="view-viewer-toolbar">
      <CheckBox :checked="outlines" label="Outline every element" @change="outlines = $event">Elements</CheckBox>
      <CheckBox v-if="totals.texts" :checked="hideTextNames" label="Hide the names of text elements" @change="hideTextNames = $event">Hide text names</CheckBox>
      <CheckBox :checked="hidden" label="Draw the hidden elements" @change="hidden = $event">Hidden elements<small v-if="totals.hidden" class="text-muted"> ({{ number(totals.hidden) }})</small></CheckBox>
      <span v-if="animations" class="view-viewer-play" role="group" aria-label="Animations">
        <button type="button" class="btn btn-outline-secondary btn-sm" :aria-pressed="!playing" @click="playing = !playing">
          <i aria-hidden="true" :class="['mdi', playing ? 'mdi-pause' : 'mdi-play']" />{{ playing ? 'Pause' : 'Play' }}
        </button>
        <button type="button" class="btn btn-outline-secondary btn-sm" title="Play every animation again from its first frame" @click="restart++; playing = true">
          <i aria-hidden="true" class="mdi mdi-replay" />Replay
        </button>
        <small class="text-muted">{{ number(animations) }} animation{{ plural(animations) }}</small>
      </span>
      <span v-if="editable && state === 'ready'" class="view-viewer-edit" role="group" aria-label="Moved elements">
        <template v-if="movedCount">
          <span class="view-viewer-moved">{{ number(movedCount) }} element{{ plural(movedCount) }} moved</span>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!history.length || saving" title="Take back the last change (Ctrl+Z)" @click="undo"><i aria-hidden="true" class="mdi mdi-undo" />Undo</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="saving" @click="discard"><i aria-hidden="true" class="mdi mdi-close" />Discard</button>
          <button type="button" class="btn btn-primary btn-sm" :disabled="saving" :title="`Write the new positions into ${many ? 'the views\' files' : `${name}'s file`}`" @click="save">
            <i aria-hidden="true" :class="['mdi', saving ? 'mdi-loading mdi-spin' : 'mdi-content-save-outline']" />Save
          </button>
        </template>
        <small v-else class="text-muted">Drag an element, or its x and y in the list, to move it</small>
      </span>
      <span class="view-viewer-summary text-muted">{{ many ? `${number(stack.length)} views · ${number(totals.elements)} elements` : viewSummary(facts) }}</span>
      <span v-if="totals.missing" class="view-viewer-missing"><i aria-hidden="true" class="mdi mdi-alert-outline" />{{ number(totals.missing) }} element{{ plural(totals.missing) }} without {{ totals.missing === 1 ? 'its resource' : 'their resources' }}</span>
    </div>
    <ol v-if="many" class="view-layers" aria-label="Views, the one drawn on top first">
      <li v-for="row in layerRows" :key="row.layer.file" :class="{ 'is-off': off.has(row.index) }"
          :title="`${row.layer.name}: layer ${row.position + 1}, ${row.layer.facts.resolution.width} × ${row.layer.facts.resolution.height}, ${number(row.layer.facts.elements)} element${plural(row.layer.facts.elements)}`">
        <CheckBox :checked="!off.has(row.index)" :label="`Show ${row.layer.name}`" @change="$event ? off.delete(row.index) : off.add(row.index)">
          <span class="details-code">{{ row.layer.name }}</span>
        </CheckBox>
        <span class="view-layer-moves">
          <button type="button" class="details-icon" :disabled="row.position === order.length - 1" :aria-label="`Draw ${row.layer.name} higher`" title="Draw higher" @click="move(row.position, 1)"><i aria-hidden="true" class="mdi mdi-arrow-up" /></button>
          <button type="button" class="details-icon" :disabled="row.position === 0" :aria-label="`Draw ${row.layer.name} lower`" title="Draw lower" @click="move(row.position, -1)"><i aria-hidden="true" class="mdi mdi-arrow-down" /></button>
        </span>
      </li>
    </ol>
    <p v-if="many && mixed" class="view-viewer-note text-muted">The views have different resolutions: each is drawn from the top left corner of the screen.</p>
    <div class="view-stage" :style="{ aspectRatio: `${resolution.width} / ${resolution.height}`, maxWidth: `calc(58vh * ${resolution.width} / ${resolution.height})` }">
      <template v-for="{ index, layer } in shown" :key="layer.file">
        <ViewRender v-if="!failed.has(layer.file)" :style="placed(layer)" :file="layer.file" :name="layer.name" :revision="revision" :resolution="layer.facts.resolution"
                    :hidden="hidden" :layout="layouts[index] ?? null" :playing="playing" :restart="restart" :moves="movesOf(index)" @error="failed.add(layer.file)" />
        <p v-else class="view-stage-state text-danger"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" />{{ many ? `${layer.name} cannot be drawn` : 'The view cannot be drawn' }}</p>
      </template>
      <svg v-if="state === 'ready'" ref="overlay" :class="['view-stage-overlay', { 'is-editable': editable }]" :viewBox="`0 0 ${resolution.width} ${resolution.height}`" preserveAspectRatio="none"
           role="group" :aria-label="`Elements of ${many ? `${stack.length} views` : name}`" :style="{ '--view-label': `${labelSize}px` }"
           @pointermove="pointerMove" @pointerup="pointerUp" @pointercancel="cancelDrag">
        <g v-for="{ index, layer } in shown" :key="layer.file" :data-view="layer.name">
          <!-- An editable preview keeps every element that is drawn there under the pointer, outlined or not, to drag it. -->
          <g v-for="element in elementsOf(index)" v-show="outlined(index, element) || (editable && draggable(element))" :key="element.index"
             :class="['view-element', kindOf(element), { 'is-picked': keyOf(index, element) === picked, 'is-quiet': !outlined(index, element), 'is-moved': !!moves[keyOf(index, element)] }]"
             :data-element="element.id" @click="!editable && pick(index, element)" @pointerdown="pointerDown($event, index, element)">
            <title>{{ titleOf(layer, element) }}</title>
            <polygon v-if="hasArea(element)" :points="points(shifted(index, element, element.corners))" />
            <polygon v-if="element.touchArea && (outlines || keyOf(index, element) === picked)" class="view-touch" :points="points(shifted(index, element, element.touchArea))" />
            <path v-if="!hasArea(element)" :d="`M${positionOf(index, element)[0] - 12},${positionOf(index, element)[1]}h24M${positionOf(index, element)[0]},${positionOf(index, element)[1] - 12}v24`" class="view-point" />
            <text v-if="labelled(index, element)" :x="labelAt(index, element)[0] + 4" :y="labelAt(index, element)[1] + labelSize + 2">{{ element.id || element.type }}</text>
          </g>
        </g>
      </svg>
      <p v-else-if="state === 'loading'" class="view-stage-state text-muted"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" />Loading the elements…</p>
    </div>
    <p v-for="message in errors" :key="message" class="text-danger view-viewer-error">{{ message }}</p>
    <template v-for="(layer, index) in stack" :key="layer.file">
      <details v-if="elementsOf(index).length" class="view-elements">
        <summary>{{ many ? `${layer.name}: ` : '' }}{{ number(elementsOf(index).length) }} element{{ plural(elementsOf(index).length) }}, drawn in this order</summary>
        <table class="table table-sm">
          <thead><tr><th scope="col">#</th><th scope="col">Id</th><th scope="col">Type</th><th scope="col">Resource</th><th scope="col">Position</th><th scope="col">Draws</th></tr></thead>
          <tbody>
            <tr v-for="element in elementsOf(index)" :key="element.index"
                :class="{ 'is-picked': keyOf(index, element) === picked, 'is-missing': element.reason && !element.movie, 'is-moved': !!moves[keyOf(index, element)] }"
                @click="pick(index, element)">
              <td><button type="button" class="details-icon view-element-open" :aria-label="`Open ${element.id || `element ${element.index + 1}`} in VS Code`" :title="`Open in VS Code: ${layer.name}, ${element.id || `element ${element.index + 1}`}`" @click.stop="openViewElement(layer.file, element.index)">{{ '{' + (element.index + 1) + '}' }}</button></td>
              <td class="details-code">{{ element.id }}<small v-if="element.hidden && element.type !== 'Dummy'" class="text-muted"> hidden</small></td>
              <td>{{ element.type }}</td>
              <td class="details-code" :title="element.file">{{ element.keys.join(', ') || '—' }}</td>
              <td v-if="editable" class="view-element-position">
                <NumberScrub axis="x" :value="positionOf(index, element)[0]" :label="`x of ${element.id || `element ${element.index + 1}`}`"
                             @begin="beginChange(index, element)" @change="setPosition(index, element, [$event, positionOf(index, element)[1]])" />,
                <NumberScrub axis="y" :value="positionOf(index, element)[1]" :label="`y of ${element.id || `element ${element.index + 1}`}`"
                             @begin="beginChange(index, element)" @change="setPosition(index, element, [positionOf(index, element)[0], $event])" />
              </td>
              <td v-else class="text-muted">{{ Math.round(element.position[0]) }}, {{ Math.round(element.position[1]) }}</td>
              <td>{{ describe(element) }}</td>
            </tr>
          </tbody>
        </table>
      </details>
    </template>
  </div>
</template>

<style scoped>
.view-preview-screen, .view-stage {
  background-color: #2b2f36;
  background-image: linear-gradient(45deg, #353a42 25%, transparent 25%), linear-gradient(-45deg, #353a42 25%, transparent 25%),
    linear-gradient(45deg, transparent 75%, #353a42 75%), linear-gradient(-45deg, transparent 75%, #353a42 75%);
  background-size: 16px 16px;
  background-position: 0 0, 0 8px, 8px -8px, -8px 0;
}
.view-preview-screen img { width: 100%; height: 100%; object-fit: contain; }
.view-preview-caption { position: absolute; left: 8px; bottom: 6px; padding: 1px 6px; border-radius: 3px; background: rgba(0, 0, 0, 0.55); color: #fff; font-size: 11px; }
.generic-preview.view { color: #c9ced6; }
.view-viewer-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; margin-bottom: 10px; font-size: 13px; }
.view-viewer-summary { font-size: 12px; }
.view-viewer-play { display: inline-flex; align-items: center; gap: 6px; }
.view-viewer-play .btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 12px; }
.view-viewer-missing { color: #c77700; font-size: 12px; }
.view-viewer-missing i { margin-right: 4px; }
.view-viewer-note { margin: 0 0 8px; font-size: 12px; }
/* The views as chips, the one drawn on top first. */
.view-layers { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 10px; padding: 0; list-style: none; font-size: 12px; }
.view-layers li { display: inline-flex; align-items: center; gap: 2px; padding: 0 2px 0 8px; border: 1px solid #e3e6ea; border-radius: 14px; background: #f6f7f9; }
.view-layers li.is-off { opacity: 0.55; }
.view-layers li :deep(.form-check) { margin: 0; }
.view-layer-moves { display: inline-flex; }
.view-layer-moves .details-icon { width: 24px; height: 24px; }
.view-stage { position: relative; width: 100%; margin: 0 auto; overflow: hidden; border-radius: 4px; }
.view-stage-image { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
.view-stage-overlay { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
.view-stage-state { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; gap: 6px; margin: 0; font-size: 13px; }
.view-element { cursor: pointer; fill: transparent; stroke: #4fc3f7; stroke-width: 2; vector-effect: non-scaling-stroke; }
.view-element polygon, .view-element path { vector-effect: non-scaling-stroke; }
.view-element.is-text { stroke: #ffd54f; stroke-dasharray: 6 4; }
.view-element.is-dummy { stroke: #ce93d8; }
.view-element.is-empty { stroke: #b0bec5; stroke-dasharray: 3 3; }
.view-element.is-missing { stroke: #ff5252; stroke-dasharray: 6 4; }
.view-element .view-touch { stroke: #81c784; stroke-dasharray: 4 4; }
.view-element .view-point { stroke-width: 2; }
.view-element.is-picked { stroke: #ff4081; stroke-width: 3; fill: rgba(255, 64, 129, 0.12); }
/* An editable preview: every element can be dragged; one that is not outlined only takes the pointer. */
.view-stage-overlay.is-editable .view-element { cursor: move; touch-action: none; }
.view-element.is-quiet:not(.is-picked) { stroke: none; }
.view-element.is-moved:not(.is-picked) { stroke: #ffab40; stroke-dasharray: none; }
.view-element text { fill: #fff; stroke: rgba(0, 0, 0, 0.75); stroke-width: 3px; paint-order: stroke; font-size: var(--view-label); font-family: monospace; vector-effect: none; }
.view-viewer-error { margin: 6px 0 0; font-size: 12px; }
.view-elements { margin-top: 10px; font-size: 12px; }
.view-elements summary { color: #6c757d; cursor: pointer; }
.view-elements table { margin: 6px 0 0; }
.view-elements tbody tr { cursor: pointer; }
.view-element-open { width: auto; min-width: 28px; padding: 0 4px; font-family: monospace; font-size: 12px; }
.view-elements tr.is-picked td { background: #fde4ee; }
.view-elements tr.is-moved td.view-element-position { color: #e65100; font-weight: 500; }
.view-element-position { white-space: nowrap; }
.view-viewer-edit { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 6px; }
.view-viewer-edit .btn { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 12px; }
.view-viewer-moved { color: #e65100; font-size: 12px; font-weight: 500; }
.view-elements tr.is-missing td:last-child { color: #d2453c; }
</style>
