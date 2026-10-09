<script lang="ts">
import { ref } from 'vue';

// Whether the names of text elements are hidden, kept for every view the details show.
const hideTextNames = ref(false);
</script>

<script setup lang="ts">
import { computed, watch } from 'vue';
import { number, plural, viewRenderURL, viewSummary } from '../format';
import type { ViewElement, ViewFacts, ViewLayout } from '../types';
import { openViewElement } from '../workspace';
import CheckBox from './CheckBox.vue';

// A view, a .json file of a game's v folder, as the game's view elements draw it: the backend composes its elements
// into an image of the view's screen (GET /api/rss-sync/preview with a width), over a checkerboard where the view is
// transparent. A card shows a small render of the part of the screen the view draws on. A large preview shows the view at its own width, with the areas of the
// texts that the game fills in outlined with their ids, Elements to outline every element (dummies as crosses, the
// touch areas of buttons dashed, elements that draw nothing in red), Hidden elements to draw the hidden ones too, Hide text
// names to outline the texts' areas without their names (one picked in the list keeps its name), and
// the list of elements, which outlines the one clicked. The elements come from GET /api/rss-sync/view.
const props = withDefaults(defineProps<{
  /** The view's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  facts: ViewFacts;
  large?: boolean;
}>(), { large: false });

const CARD_WIDTH = 640;
const failed = ref(false);
const hidden = ref(false);
const outlines = ref(false);
const picked = ref<number | null>(null);
const resolution = computed(() => props.facts.resolution);
const source = computed(() => (props.large
  ? viewRenderURL(props.file, props.revision, resolution.value.width, hidden.value)
  : viewRenderURL(props.file, props.revision, CARD_WIDTH, false, true)));
watch(source, () => { failed.value = false; });

const layout = ref<ViewLayout | null>(null);
const state = ref<'loading' | 'ready' | 'failed'>('loading');
const error = ref('');
let request = 0;
async function load() {
  const id = ++request;
  state.value = 'loading';
  try {
    const response = await fetch(`/api/rss-sync/view?file=${encodeURIComponent(props.file)}&v=${encodeURIComponent(props.revision)}`);
    const body = await response.json().catch(() => null);
    if (id !== request) return;
    if (!response.ok || !body) throw new Error(body?.error || 'The elements could not be loaded');
    layout.value = body as ViewLayout;
    state.value = 'ready';
  } catch (e) {
    if (id !== request) return;
    error.value = (e as Error).message;
    state.value = 'failed';
  }
}
watch(() => [props.large, props.file, props.revision], () => {
  picked.value = null;
  if (props.large) void load();
}, { immediate: true });

const elements = computed(() => layout.value?.elements ?? []);
const points = (corners: [number, number][]) => corners.map(([x, y]) => `${x},${y}`).join(' ');
const hasArea = (element: ViewElement) => element.size[0] > 0 && element.size[1] > 0;
/** Whether an element is outlined: a text's area always, every element with Elements, and the one picked in the list. */
function outlined(element: ViewElement) {
  if (element.index === picked.value) return true;
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
  if (element.frames) return `${number(element.frames)} frames${element.frameTime ? ` every ${element.frameTime} ms` : ''}, the first drawn`;
  if (element.page) return `RTF page ${element.page}`;
  return element.drawn ? `${Math.round(element.size[0])} × ${Math.round(element.size[1])}` : '—';
}
const titleOf = (element: ViewElement) => [element.id || `#${element.index}`, element.type, element.keys.join(', '), describe(element)].filter(Boolean).join(' · ');
const labelAt = (element: ViewElement) => element.corners[0];
/** Whether an element's name is drawn: a text's unless text names are hidden, any with Elements, and the one picked. */
const labelled = (element: ViewElement) => element.index === picked.value || (element.type === 'Text' ? !hideTextNames.value : outlines.value);
// Labels are drawn at a size that stays readable when the view is scaled down to fit.
const labelSize = computed(() => Math.max(14, resolution.value.width / 90));
</script>

<template>
  <div v-if="!large" class="view-preview">
    <div class="thumbnail view-preview-screen">
      <img v-if="!failed" :src="source" :alt="`${name}, a view of ${facts.resolution.width} × ${facts.resolution.height}`" loading="lazy" @error="failed = true">
      <div v-else class="generic-preview view"><i aria-hidden="true" class="mdi mdi-view-dashboard-outline" /><small>The view cannot be drawn</small></div>
      <span class="badge file-format">VIEW</span>
      <span class="view-preview-caption">{{ facts.resolution.width }} × {{ facts.resolution.height }} · {{ number(facts.elements) }} element{{ plural(facts.elements) }}</span>
    </div>
  </div>
  <div v-else class="view-viewer">
    <div class="view-viewer-toolbar">
      <CheckBox :checked="outlines" label="Outline every element" @change="outlines = $event">Elements</CheckBox>
      <CheckBox v-if="facts.types.Text" :checked="hideTextNames" label="Hide the names of text elements" @change="hideTextNames = $event">Hide text names</CheckBox>
      <CheckBox :checked="hidden" label="Draw the hidden elements" @change="hidden = $event">Hidden elements<small v-if="facts.hidden" class="text-muted"> ({{ number(facts.hidden) }})</small></CheckBox>
      <span class="view-viewer-summary text-muted">{{ viewSummary(facts) }}</span>
      <span v-if="facts.missingCount" class="view-viewer-missing"><i aria-hidden="true" class="mdi mdi-alert-outline" />{{ number(facts.missingCount) }} element{{ plural(facts.missingCount) }} without {{ facts.missingCount === 1 ? 'its resource' : 'their resources' }}</span>
    </div>
    <div class="view-stage" :style="{ aspectRatio: `${resolution.width} / ${resolution.height}`, maxWidth: `calc(58vh * ${resolution.width} / ${resolution.height})` }">
      <img v-if="!failed" class="view-stage-image" :src="source" :alt="`${name} as the game draws it`" @error="failed = true">
      <p v-else class="view-stage-state text-danger"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" />The view cannot be drawn</p>
      <svg v-if="state === 'ready'" class="view-stage-overlay" :viewBox="`0 0 ${resolution.width} ${resolution.height}`" preserveAspectRatio="none"
           role="group" :aria-label="`Elements of ${name}`" :style="{ '--view-label': `${labelSize}px` }">
        <g v-for="element in elements" v-show="outlined(element)" :key="element.index" :class="['view-element', kindOf(element), { 'is-picked': element.index === picked }]"
           :data-element="element.id" @click="picked = element.index === picked ? null : element.index">
          <title>{{ titleOf(element) }}</title>
          <polygon v-if="hasArea(element)" :points="points(element.corners)" />
          <polygon v-if="element.touchArea && (outlines || element.index === picked)" class="view-touch" :points="points(element.touchArea)" />
          <path v-if="!hasArea(element)" :d="`M${element.position[0] - 12},${element.position[1]}h24M${element.position[0]},${element.position[1] - 12}v24`" class="view-point" />
          <text v-if="labelled(element)" :x="labelAt(element)[0] + 4" :y="labelAt(element)[1] + labelSize + 2">{{ element.id || element.type }}</text>
        </g>
      </svg>
      <p v-else-if="state === 'loading'" class="view-stage-state text-muted"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" />Loading the elements…</p>
    </div>
    <p v-if="state === 'failed'" class="text-danger view-viewer-error">{{ error }}</p>
    <details v-if="elements.length" class="view-elements">
      <summary>{{ number(elements.length) }} element{{ plural(elements.length) }}, drawn in this order</summary>
      <table class="table table-sm">
        <thead><tr><th scope="col">#</th><th scope="col">Id</th><th scope="col">Type</th><th scope="col">Resource</th><th scope="col">Position</th><th scope="col">Draws</th></tr></thead>
        <tbody>
          <tr v-for="element in elements" :key="element.index" :class="{ 'is-picked': element.index === picked, 'is-missing': element.reason && !element.movie }"
              @click="picked = element.index === picked ? null : element.index">
            <td><button type="button" class="details-icon view-element-open" :aria-label="`Open ${element.id || `element ${element.index + 1}`} in VS Code`" :title="`Open in VS Code: ${name}, ${element.id || `element ${element.index + 1}`}`" @click.stop="openViewElement(file, element.index)">{{ '{' + (element.index + 1) + '}' }}</button></td>
            <td class="details-code">{{ element.id }}<small v-if="element.hidden && element.type !== 'Dummy'" class="text-muted"> hidden</small></td>
            <td>{{ element.type }}</td>
            <td class="details-code" :title="element.file">{{ element.keys.join(', ') || '—' }}</td>
            <td class="text-muted">{{ Math.round(element.position[0]) }}, {{ Math.round(element.position[1]) }}</td>
            <td>{{ describe(element) }}</td>
          </tr>
        </tbody>
      </table>
    </details>
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
.view-viewer-missing { color: #c77700; font-size: 12px; }
.view-viewer-missing i { margin-right: 4px; }
.view-stage { position: relative; width: 100%; margin: 0 auto; overflow: hidden; border-radius: 4px; }
.view-stage-image, .view-stage-overlay { position: absolute; inset: 0; width: 100%; height: 100%; }
.view-stage-overlay { overflow: visible; }
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
.view-element text { fill: #fff; stroke: rgba(0, 0, 0, 0.75); stroke-width: 3px; paint-order: stroke; font-size: var(--view-label); font-family: monospace; vector-effect: none; }
.view-viewer-error { margin: 6px 0 0; font-size: 12px; }
.view-elements { margin-top: 10px; font-size: 12px; }
.view-elements summary { color: #6c757d; cursor: pointer; }
.view-elements table { margin: 6px 0 0; }
.view-elements tbody tr { cursor: pointer; }
.view-element-open { width: auto; min-width: 28px; padding: 0 4px; font-family: monospace; font-size: 12px; }
.view-elements tr.is-picked td { background: #fde4ee; }
.view-elements tr.is-missing td:last-child { color: #d2453c; }
</style>
