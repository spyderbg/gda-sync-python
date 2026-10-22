<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, shallowRef, watch } from 'vue';
import { baseName, number, reportPreviewURL } from '../format';
import { differenceHeatmap, differenceStats, pixelDifferences, type ImageArea } from '../imageDifference';
import AppModal from './AppModal.vue';

const props = defineProps<{ game: string; gda: string; revision: string }>();
const emit = defineEmits<{ close: [] }>();
const loading = ref(true), error = ref('');
const tolerance = ref(0), zoom = ref(100);
const differences = shallowRef<ReturnType<typeof pixelDifferences> | null>(null);
const detailCanvases = ref<HTMLCanvasElement[]>([]);
const viewports = ref<HTMLDivElement[]>([]);
const panning = ref(false);
let sources: HTMLCanvasElement[] = [];
let heatmap: HTMLCanvasElement | null = null;
let request = 0, frame = 0;
let drag: { x: number; y: number; left: number; top: number; pointer: number; target: HTMLDivElement } | null = null;
const fullArea = computed<ImageArea>(() => ({ x: 0, y: 0, width: differences.value?.width ?? 1, height: differences.value?.height ?? 1 }));
const fullStats = computed(() => differences.value && differenceStats(differences.value.values, differences.value.width, fullArea.value, tolerance.value));
const percent = computed(() => ((fullStats.value?.changed ?? 0) / (fullArea.value.width * fullArea.value.height) * 100).toFixed(2));
const displaySize = computed(() => ({ width: fullArea.value.width * zoom.value / 100, height: fullArea.value.height * zoom.value / 100 }));

function canvas(width: number, height: number) {
  const result = document.createElement('canvas');
  result.width = width; result.height = height;
  return result;
}
async function loadImage(file: string) {
  const image = new Image();
  image.src = reportPreviewURL(file, props.revision);
  try { await image.decode(); } catch { throw new Error(`Cannot load image: ${baseName(file)}. Close this dialog and rescan if the file changed.`); }
  return image;
}
watch(() => [props.game, props.gda, props.revision], async () => {
  const id = ++request;
  cancelDrag();
  loading.value = true; error.value = ''; differences.value = null;
  sources = []; heatmap = null;
  try {
    const images = await Promise.all([loadImage(props.game), loadImage(props.gda)]);
    if (id !== request) return;
    const width = Math.max(...images.map(image => image.naturalWidth)), height = Math.max(...images.map(image => image.naturalHeight));
    if (!width || !height || width * height > 32_000_000 || width > 16384 || height > 16384) {
      throw new Error('These images are too large for detailed comparison (maximum 32 million pixels and 16,384 pixels per side).');
    }
    sources = images.map(image => {
      const result = canvas(image.naturalWidth, image.naturalHeight);
      result.getContext('2d')!.drawImage(image, 0, 0);
      return result;
    });
    differences.value = pixelDifferences(...sources.map(source => source.getContext('2d')!.getImageData(0, 0, source.width, source.height)) as [ImageData, ImageData]);
    heatmap = canvas(width, height);
    loading.value = false;
    await nextTick();
    if (id !== request) return;
    renderHeatmap();
    fit();
  } catch (e) {
    if (id === request) { error.value = (e as Error).message; loading.value = false; differences.value = null; sources = []; heatmap = null; }
  }
}, { immediate: true });

function renderHeatmap() {
  if (!differences.value || !heatmap) return;
  const { values, width, height } = differences.value;
  heatmap.getContext('2d')!.putImageData(new ImageData(differenceHeatmap(values, tolerance.value), width, height), 0, 0);
  renderDetails();
}
function renderDetails() {
  if (!heatmap) return;
  [sources[0], heatmap, sources[1]].forEach((source, index) => {
    const target = detailCanvases.value[index];
    if (!target) return;
    target.width = fullArea.value.width; target.height = fullArea.value.height;
    target.getContext('2d')!.drawImage(source, 0, 0);
  });
}
watch(tolerance, () => {
  cancelAnimationFrame(frame);
  frame = requestAnimationFrame(renderHeatmap);
});
const limitZoom = (value: number) => Math.max(1, Math.min(800, Math.round(value)));
function syncPan(left: number, top: number) {
  viewports.value.forEach(viewport => { viewport.scrollLeft = left; viewport.scrollTop = top; });
}
// Small images are centered in each pane. Include that inset when anchoring zoom to the mouse position.
function inset(viewport: HTMLDivElement) {
  return { x: Math.max(0, (viewport.clientWidth - displaySize.value.width) / 2), y: Math.max(0, (viewport.clientHeight - displaySize.value.height) / 2) };
}
async function focusArea(area: ImageArea) {
  const viewport = viewports.value[0];
  if (!viewport) return;
  zoom.value = limitZoom(Math.floor(Math.min((viewport.clientWidth - 20) / area.width, (viewport.clientHeight - 20) / area.height) * 100));
  await nextTick();
  const offset = inset(viewport), scale = zoom.value / 100;
  syncPan((area.x + area.width / 2) * scale + offset.x - viewport.clientWidth / 2,
    (area.y + area.height / 2) * scale + offset.y - viewport.clientHeight / 2);
}
function fit() { void focusArea(fullArea.value); }
function zoomDifferences() { if (fullStats.value?.bounds) void focusArea(fullStats.value.bounds); }
async function setZoom(value: number, viewport = viewports.value[0], anchor?: { x: number; y: number }) {
  if (!viewport || !Number.isFinite(value)) return;
  const next = limitZoom(value);
  if (next === zoom.value) return;
  cancelDrag();
  const point = anchor ?? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 };
  const before = inset(viewport), oldScale = zoom.value / 100;
  const x = (viewport.scrollLeft + point.x - before.x) / oldScale;
  const y = (viewport.scrollTop + point.y - before.y) / oldScale;
  zoom.value = next;
  await nextTick();
  const after = inset(viewport), scale = zoom.value / 100;
  syncPan(x * scale + after.x - point.x, y * scale + after.y - point.y);
}
function wheel(event: WheelEvent) {
  if (!event.deltaY) return;
  const viewport = event.currentTarget as HTMLDivElement, bounds = viewport.getBoundingClientRect();
  const delta = event.deltaY * (event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientHeight : 1);
  const next = zoom.value * Math.exp(-Math.max(-200, Math.min(200, delta)) * .002);
  // Even a small wheel step changes an integer zoom percentage.
  void setZoom(event.deltaY < 0 ? Math.max(zoom.value + 1, next) : Math.min(zoom.value - 1, next), viewport,
    { x: event.clientX - bounds.left - viewport.clientLeft, y: event.clientY - bounds.top - viewport.clientTop });
}
function scroll(event: Event) {
  const source = event.currentTarget as HTMLDivElement;
  viewports.value.forEach(viewport => {
    if (viewport !== source) { viewport.scrollLeft = source.scrollLeft; viewport.scrollTop = source.scrollTop; }
  });
}
function start(event: PointerEvent) {
  if (event.button !== 0 || !event.isPrimary) return;
  const target = event.currentTarget as HTMLDivElement;
  event.preventDefault();
  target.focus({ preventScroll: true });
  target.setPointerCapture(event.pointerId);
  drag = { x: event.clientX, y: event.clientY, left: target.scrollLeft, top: target.scrollTop, pointer: event.pointerId, target };
  panning.value = true;
}
function move(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return;
  syncPan(drag.left + drag.x - event.clientX, drag.top + drag.y - event.clientY);
}
function finish(event: PointerEvent) {
  if (!drag || event.pointerId !== drag.pointer) return;
  move(event);
  cancelDrag();
}
function cancelDrag() {
  const previous = drag;
  drag = null; panning.value = false;
  if (previous?.target.hasPointerCapture(previous.pointer)) previous.target.releasePointerCapture(previous.pointer);
}
onBeforeUnmount(() => { request++; cancelAnimationFrame(frame); cancelDrag(); sources = []; heatmap = null; });
</script>

<template>
  <AppModal title="Detailed image compare" xl stacked dialog-class="image-compare-dialog" @close="emit('close')">
    <div class="modal-body image-compare">
      <p v-if="loading" role="status">Loading images and comparing pixels…</p>
      <p v-else-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
      <template v-else-if="differences">
        <p class="text-muted compare-hint">Hold the left mouse button and drag to move the image. Scroll the mouse wheel to zoom in or out at the pointer. All three views move together.</p>
        <p v-if="sources[0].width !== sources[1].width || sources[0].height !== sources[1].height" class="alert alert-info compare-hint">Image sizes differ. Images align at the top left without scaling; pixels outside either image count as differences.</p>
        <div class="compare-controls">
          <div class="compare-area-actions">
            <button type="button" class="btn btn-sm btn-outline-primary" :disabled="!fullStats?.bounds" @click="zoomDifferences">Zoom to differences</button>
            <button type="button" class="btn btn-sm btn-light" @click="fit">Full image</button>
          </div>
          <label class="compare-slider">Tolerance <strong>{{ tolerance }} / 255</strong><input v-model.number="tolerance" aria-label="Difference tolerance" type="range" min="0" max="255" step="1"><small>Ignore channel differences up to this value.</small></label>
          <div class="compare-zoom"><label class="compare-slider">Zoom <strong>{{ zoom }}%</strong><input :value="zoom" aria-label="Image zoom" type="range" min="1" max="800" step="1" @input="setZoom(Number(($event.target as HTMLInputElement).value))"></label><button type="button" class="btn btn-sm btn-light" @click="setZoom(100)">1:1</button></div>
        </div>
        <div class="compare-details">
          <figure v-for="(label, index) in ['Game image', 'Difference heat map', 'GDA image']" :key="label">
            <figcaption>{{ label }}<small v-if="index !== 1">{{ sources[index === 0 ? 0 : 1].width }} × {{ sources[index === 0 ? 0 : 1].height }}</small><span v-if="index !== 1" :title="index === 0 ? game : gda">{{ baseName(index === 0 ? game : gda) }}</span><span v-else>Within tolerance → strongest difference</span></figcaption>
            <div :ref="element => viewports[index] = element as HTMLDivElement" :class="['compare-viewport', { 'is-panning': panning }]" tabindex="0" :aria-label="label" @scroll="scroll" @wheel.prevent="wheel"
                 @pointerdown="start" @pointermove="move" @pointerup="finish" @pointercancel="cancelDrag" @lostpointercapture="cancelDrag">
              <div class="compare-surface">
                <canvas :ref="element => detailCanvases[index] = element as HTMLCanvasElement" :width="fullArea.width" :height="fullArea.height" :style="{ width: `${displaySize.width}px`, height: `${displaySize.height}px` }" :aria-label="label" />
              </div>
            </div>
          </figure>
        </div>
        <div class="compare-results">
          <p role="status" class="compare-stats"><strong>{{ number(fullStats?.changed ?? 0) }} of {{ number(fullArea.width * fullArea.height) }} pixels differ ({{ percent }}%)</strong><small>Full image · maximum difference {{ fullStats?.maximum ?? 0 }} / 255 · tolerance {{ tolerance }}</small></p>
          <div class="compare-legend" aria-label="Heat map legend"><span class="compare-unchanged" />Within tolerance<span class="compare-gradient" />Low → high difference</div>
        </div>
        <p class="text-muted compare-hint mb-0">Compares visible RGB and alpha at original resolution. Fully transparent RGB is ignored. All three detail views zoom and scroll together.</p>
      </template>
    </div>
    <div class="modal-footer"><button type="button" class="btn btn-light" @click="emit('close')">Close compare</button></div>
  </AppModal>
</template>

<style scoped>
:global(.modal-dialog.image-compare-dialog) { max-width: min(1440px, calc(100% - 32px)); }
.image-compare { font-size: .875rem; }
.compare-hint { font-size: .8rem; }
.compare-details { display: grid; gap: 16px; grid-template-columns: repeat(3, minmax(0, 1fr)); }
figure { min-width: 0; margin: 0; }
figcaption { margin-bottom: 6px; font-weight: 600; }
figcaption small { float: right; font-weight: 400; }
figcaption span { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: .75rem; font-weight: 400; }
.compare-viewport { background: #e7e9ef; background-image: conic-gradient(#d4d7df 25%, transparent 0 50%, #d4d7df 0 75%, transparent 0); background-size: 16px 16px; border: 1px solid #c5cbd6; border-radius: 4px; }
.compare-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 16px; margin: 18px 0; padding: 12px; border: 1px solid #dce0e8; border-radius: 6px; }
.compare-area-actions { display: flex; gap: 6px; flex-wrap: wrap; }
.compare-slider { display: grid; grid-template-columns: 1fr auto; gap: 4px 12px; margin: 0; flex: 1; min-width: 160px; font-size: .8rem; }
.compare-slider input, .compare-slider small { grid-column: 1 / -1; width: 100%; }
.compare-slider input { accent-color: #2361cc; }
.compare-slider small { color: #687083; }
.compare-zoom { display: flex; align-items: center; gap: 6px; flex: 1; }
.compare-viewport { height: 420px; overflow: auto; overscroll-behavior: contain; cursor: grab; touch-action: none; user-select: none; }
.compare-viewport.is-panning { cursor: grabbing; }
.compare-surface { display: grid; place-items: center; width: max-content; height: max-content; min-width: 100%; min-height: 100%; }
.compare-viewport canvas { display: block; max-width: none; image-rendering: pixelated; }
.compare-results { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; margin: 14px 0 8px; }
.compare-stats { margin: 0; }
.compare-stats small { display: block; color: #687083; margin-top: 4px; }
.compare-legend { display: flex; align-items: center; gap: 8px; font-size: .75rem; }
.compare-unchanged { width: 16px; height: 12px; background: #0c1430; }
.compare-gradient { width: 90px; height: 12px; background: linear-gradient(to right, #0000ff, #ffff00, #ff0000); }
@media (max-width: 700px) {
  .compare-details { grid-template-columns: minmax(0, 1fr); }
  .compare-viewport { height: 220px; }
  .compare-controls { gap: 12px; }
}
</style>
