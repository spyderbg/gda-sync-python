<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { baseName, reportPreviewURL } from '../format';
import type { ImageMetadata } from '../imageStudio';

const props = defineProps<{ sequence: NonNullable<ImageMetadata['sequence']>; game: string; revision: string }>();
const root = ref<HTMLElement>();
const canvas = ref<HTMLCanvasElement>();
const index = ref(0);
const playing = ref(false);
const failed = ref(false);
const ready = ref(false);
const thumbnails = new Map<number, HTMLCanvasElement>();
let images = new Map<string, HTMLImageElement | null>();
let failedPaths = new Set<string>();
let generation = 0;
let handle = 0;
let last = 0;
let loops = 0;
let observer: IntersectionObserver | undefined;
const visibleFrames = computed(() => {
  const start = Math.min(Math.max(0, index.value - 2), Math.max(0, props.sequence.frames.length - 5));
  return props.sequence.frames.slice(start, start + 5).map((frame, offset) => ({ ...frame, index: start + offset }));
});
const file = (path: string) => `${props.game.replace(/\\/g, '/').replace(/\/$/, '')}/${path}`;

function drawFrame(target: HTMLCanvasElement, position: number, thumbnail = false) {
  const frame = props.sequence.frames[position];
  const image = frame && images.get(frame.path);
  const context = target.getContext('2d');
  if (!image || !context) return false;
  const { x, y, w, h } = frame.source ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  if (w <= 0 || h <= 0 || x < 0 || y < 0 || x + w > image.naturalWidth || y + h > image.naturalHeight) return false;
  const scale = Math.min(1, (thumbnail ? 160 : 1920) / Math.max(w, h));
  target.width = Math.max(1, Math.round(w * scale));
  target.height = Math.max(1, Math.round(h * scale));
  context.clearRect(0, 0, target.width, target.height);
  context.drawImage(image, x, y, w, h, 0, 0, target.width, target.height);
  return true;
}
function draw() {
  const frame = props.sequence.frames[index.value];
  if (frame && images.get(frame.path) && canvas.value) {
    ready.value = drawFrame(canvas.value, index.value);
    failed.value = !ready.value;
  }
  for (const [position, target] of thumbnails) drawFrame(target, position, true);
}
function load(position: number) {
  const frame = props.sequence.frames[position];
  if (!frame || images.has(frame.path)) return;
  images.set(frame.path, null);
  const current = generation;
  const image = new Image();
  image.onload = () => {
    if (current !== generation || !images.has(frame.path)) return;
    images.set(frame.path, image);
    draw();
  };
  image.onerror = () => {
    if (current !== generation) return;
    failedPaths.add(frame.path);
    if (props.sequence.frames[index.value]?.path === frame.path) failed.value = true;
  };
  image.src = reportPreviewURL(file(frame.path), props.revision);
}
function setThumbnail(position: number, element: unknown) {
  if (element instanceof HTMLCanvasElement) {
    thumbnails.set(position, element);
    load(position);
    drawFrame(element, position, true);
  } else thumbnails.delete(position);
}
function pause() {
  playing.value = false;
  cancelAnimationFrame(handle);
}
function seek(position: number) {
  pause();
  index.value = position;
}
function tick(now: number) {
  if (!playing.value) return;
  if (document.hidden) { pause(); return; }
  if (now - last >= Math.max(1, props.sequence.frameTime)) {
    let next = index.value + 1;
    if (next >= props.sequence.frames.length) {
      if (props.sequence.loopCount > 0 && loops + 1 >= props.sequence.loopCount) { pause(); return; }
      next = Math.max(0, Math.min(props.sequence.loopTo ?? 0, props.sequence.frames.length - 1));
    }
    load(next);
    if (failedPaths.has(props.sequence.frames[next]?.path ?? '')) { pause(); index.value = next; return; }
    if (images.get(props.sequence.frames[next]?.path ?? '')) {
      if (next <= index.value) loops++;
      index.value = next;
      last = now;
    }
  }
  handle = requestAnimationFrame(tick);
}
function togglePlayback() {
  if (playing.value) { pause(); return; }
  if (!props.sequence.frames.length) return;
  if (index.value === props.sequence.frames.length - 1) index.value = 0;
  loops = 0;
  playing.value = true;
  last = performance.now();
  handle = requestAnimationFrame(tick);
}
watch(() => [props.sequence, props.game, props.revision], () => {
  pause();
  generation++;
  images = new Map();
  failedPaths = new Set();
  index.value = 0;
  failed.value = false;
  ready.value = false;
  load(0);
}, { immediate: true });
watch(index, () => {
  failed.value = failedPaths.has(props.sequence.frames[index.value]?.path ?? '');
  ready.value = false;
  load(index.value);
  load(index.value + 1);
  draw();
  // Full-size animation frames can be large. Keep only the nearby playback window.
  const retained = new Set([props.sequence.frames[0]?.path, props.sequence.frames[props.sequence.loopTo ?? 0]?.path,
    ...visibleFrames.value.map(frame => frame.path),
    ...props.sequence.frames.slice(Math.max(0, index.value - 3), index.value + 7).map(frame => frame.path)]);
  for (const path of images.keys()) if (!retained.has(path)) images.delete(path);
});
onMounted(() => {
  observer = new IntersectionObserver(([entry]) => { if (!entry.isIntersecting) pause(); });
  if (root.value) observer.observe(root.value);
  draw();
});
onBeforeUnmount(() => { generation++; pause(); observer?.disconnect(); });
</script>

<template>
  <div ref="root" class="studio-sequence-player">
    <div class="studio-sequence-stage">
      <canvas v-show="ready && !failed" ref="canvas" role="img" aria-label="Representative animation frames" />
      <span v-if="!ready && !failed" class="text-muted" aria-live="polite">Loading frame…</span>
      <span v-if="failed" class="text-muted">Frame preview unavailable</span>
    </div>
    <div class="studio-sequence-controls" role="group" aria-label="Animation playback">
      <button type="button" class="studio-play" :aria-label="playing ? 'Pause animation' : 'Play animation'" :aria-pressed="playing" @click="togglePlayback"><i aria-hidden="true" :class="['mdi', playing ? 'mdi-pause' : 'mdi-play']" /></button>
      <select :value="index" aria-label="Animation frame" @change="seek(Number(($event.target as HTMLSelectElement).value))">
        <option v-for="(_frame, position) in sequence.frames" :key="position" :value="position">{{ position + 1 }} / {{ sequence.frames.length }}</option>
      </select>
      <div class="studio-filmstrip">
        <button v-for="frame in visibleFrames" :key="frame.index" type="button" :aria-label="`Show frame ${frame.index + 1}`" :aria-pressed="index === frame.index" :title="baseName(frame.path)" @click="seek(frame.index)">
          <canvas :ref="element => setThumbnail(frame.index, element)" aria-hidden="true" />
        </button>
      </div>
      <button type="button" class="studio-next-frames" aria-label="Next frames" :disabled="index === sequence.frames.length - 1" @click="seek(Math.min(index + 5, sequence.frames.length - 1))"><i aria-hidden="true" class="mdi mdi-chevron-right" /></button>
    </div>
  </div>
</template>

<style scoped>
.studio-sequence-stage { height: 285px; display: flex; align-items: center; justify-content: center; padding: 8px; background: repeating-conic-gradient(#f1f2f7 0% 25%, white 0% 50%) 50% / 12px 12px; }
.studio-sequence-stage > canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
.studio-sequence-controls { display: grid; grid-template-columns: 32px 68px minmax(0, 1fr) 22px; align-items: center; gap: 6px; padding: 8px 0 0; }
.studio-sequence-controls button, .studio-sequence-controls select { padding: 4px; height: 32px; min-width: 0; border: 1px solid #dce2f2; border-radius: 5px; background: white; font: inherit; font-size: 11px; color: #18204e; }
.studio-sequence-controls button { cursor: pointer; }
.studio-sequence-controls .studio-play { background: #2336ff; color: white; border-color: #2336ff; font-size: 24px; line-height: 1; }
.studio-filmstrip { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 5px; min-width: 0; }
.studio-filmstrip button { height: 42px; overflow: hidden; padding: 3px; background: repeating-conic-gradient(#f1f2f7 0% 25%, white 0% 50%) 50% / 8px 8px; }
.studio-filmstrip button[aria-pressed=true] { border-color: #2336ff; box-shadow: 0 0 0 1px #2336ff; }
.studio-filmstrip canvas { width: 100%; height: 100%; object-fit: contain; display: block; }
.studio-sequence-controls .studio-next-frames { border: 0; padding: 0; font-size: 21px; }
.studio-next-frames:disabled { opacity: .35; cursor: default; }
@media (max-width: 575px) { .studio-sequence-stage { height: 230px; } .studio-sequence-controls { grid-template-columns: 30px 62px minmax(0, 1fr) 18px; gap: 4px; } .studio-filmstrip { gap: 3px; } }
</style>
