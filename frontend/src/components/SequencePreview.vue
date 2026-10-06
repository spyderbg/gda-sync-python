<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { number, plural, reportPreviewURL } from '../format';
import type { PreviewFrame } from '../types';

// An image sequence of the GDA sync report, played as the game plays it: a frame every frameTime milliseconds, loopCount
// times (0 repeats forever), each loop after the first starting at frame loopTo. A frame with a source rectangle shows
// only that part of its image. The frames load when the preview first comes into view, and it plays only while in view.
// Clicking it plays it again from the first frame, also after it finished.
const props = defineProps<{ frames: PreviewFrame[]; frameTime: number; loopCount: number; loopTo?: number | null; name: string; revision: string }>();

const root = ref<HTMLButtonElement>();
const canvas = ref<HTMLCanvasElement>();
const state = ref<'waiting' | 'loading' | 'playing' | 'finished' | 'failed'>('waiting');
const loaded = ref(0);
const files = computed(() => [...new Set(props.frames.flatMap(frame => (frame.file ? [frame.file] : [])))]);
const shown = computed(() => state.value === 'playing' || state.value === 'finished');

let images = new Map<string, HTMLImageElement>();
// A newer load or unmounting ignores the images an earlier load is still waiting for.
let generation = 0;
let index = 0;
let loops = 0;
let last = 0;
let handle = 0;
let visible = false;
let observer: IntersectionObserver | undefined;

function load() {
  const current = ++generation;
  images = new Map();
  loaded.value = 0;
  state.value = 'loading';
  void Promise.all(files.value.map(file => new Promise<void>(resolve => {
    const image = new Image();
    image.onload = () => {
      if (current === generation) { images.set(file, image); loaded.value++; }
      resolve();
    };
    image.onerror = () => {
      if (current === generation) loaded.value++;
      resolve();
    };
    image.src = reportPreviewURL(file, props.revision);
  }))).then(() => {
    if (current !== generation) return;
    if (!images.size) { state.value = 'failed'; return; }
    resize();
    play();
  });
}

const imageOf = (frame: PreviewFrame | undefined) => (frame?.file ? images.get(frame.file) : undefined);

/** The canvas holds the largest frame; a frame that has no image stays empty. */
function resize() {
  let width = 1;
  let height = 1;
  for (const frame of props.frames) {
    const image = imageOf(frame);
    if (!image) continue;
    width = Math.max(width, frame.source?.w ?? image.naturalWidth);
    height = Math.max(height, frame.source?.h ?? image.naturalHeight);
  }
  if (!canvas.value) return;
  canvas.value.width = width;
  canvas.value.height = height;
}

function draw() {
  const context = canvas.value?.getContext('2d');
  if (!context) return;
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  const frame = props.frames[index];
  const image = imageOf(frame);
  if (!image) return;
  const { x, y, w, h } = frame.source ?? { x: 0, y: 0, w: image.naturalWidth, h: image.naturalHeight };
  context.drawImage(image, x, y, w, h, 0, 0, w, h);
}

/** Show the next frame; false when the last loop ended, which keeps its last frame. */
function advance() {
  if (index < props.frames.length - 1) {
    index++;
    return true;
  }
  loops++;
  if (props.loopCount > 0 && loops >= props.loopCount) return false;
  index = props.loopTo && props.loopTo > 0 && props.loopTo < props.frames.length ? props.loopTo : 0;
  return true;
}

function tick(now: number) {
  const step = Math.max(props.frameTime, 1);
  // After a pause, such as in a hidden tab, go on from the frame shown instead of catching up.
  if (now - last > Math.max(1000, step * 2)) last = now - step;
  let changed = false;
  while (now - last >= step) {
    last += step;
    if (!advance()) { state.value = 'finished'; break; }
    changed = true;
  }
  if (changed) draw();
  if (state.value === 'playing') handle = requestAnimationFrame(tick);
}

/** Run the timer while the sequence plays and is in view, from the frame shown. */
function run() {
  cancelAnimationFrame(handle);
  if (state.value !== 'playing' || !visible) return;
  last = performance.now();
  handle = requestAnimationFrame(tick);
}

function play() {
  index = 0;
  loops = 0;
  state.value = 'playing';
  draw();
  run();
}

function replay() {
  if (shown.value) play();
}

onMounted(() => {
  observer = new IntersectionObserver(([entry]) => {
    visible = entry.isIntersecting;
    if (visible && state.value === 'waiting') load();
    else run();
  }, { rootMargin: '200px' });
  if (root.value) observer.observe(root.value);
});

onBeforeUnmount(() => {
  observer?.disconnect();
  cancelAnimationFrame(handle);
  generation++;
});

// A new report loads the frames again.
watch(() => [props.frames, props.revision], () => {
  cancelAnimationFrame(handle);
  generation++;
  state.value = 'waiting';
  if (visible) load();
});
</script>

<template>
  <button ref="root" type="button" :class="['thumbnail', 'dds', 'sequence-preview', `is-${state}`]"
          :aria-label="`Play ${name} from the first frame`" :title="state === 'finished' ? 'Play again from the first frame' : 'Play from the first frame'" @click="replay">
    <canvas v-show="shown" ref="canvas" />
    <div v-if="!shown" class="generic-preview texture">
      <i aria-hidden="true" :class="['mdi', state === 'failed' ? 'mdi-image-off-outline' : 'mdi-animation-play-outline']" />
      <small v-if="state === 'loading'" class="sequence-loading">Loading frames {{ number(loaded) }} of {{ number(files.length) }}</small>
      <small v-else-if="state === 'failed'" class="sequence-loading">No frame preview available</small>
    </div>
    <span class="badge file-format">{{ number(frames.length) }} frame{{ plural(frames.length) }}</span>
    <i v-if="state === 'finished'" aria-hidden="true" class="mdi mdi-replay sequence-replay" />
  </button>
</template>

<style scoped>
.sequence-preview { display: block; width: 100%; padding: 0; border: 0; cursor: pointer; }
.sequence-preview:focus-visible { outline-offset: -2px; }
.sequence-preview canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
.sequence-preview.is-failed, .sequence-preview.is-waiting, .sequence-preview.is-loading { cursor: default; }
.sequence-loading { margin-top: 8px; font-size: 11px; }
.sequence-replay { position: absolute; top: 50%; left: 50%; display: flex; align-items: center; justify-content: center; width: 44px; height: 44px; border-radius: 50%; background: rgba(31, 41, 55, 0.65); color: #fff; font-size: 26px; transform: translate(-50%, -50%); pointer-events: none; }
</style>
