<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { clock, reportPreviewURL } from '../format';
import ReportThumbnail from './ReportThumbnail.vue';

// A movie in the asset details, which plays only while they are open: it starts muted and loops, and closing the dialog
// stops it and lets the file go. A movie whose frames stack the picture over its alpha (valpha) shows as the game draws
// it, its picture transparent where its alpha is dark, over a checkerboard; "As encoded" shows the frames as the file
// holds them. A movie the browser cannot play shows its middle frame instead, as the backend decodes it.
const props = withDefaults(defineProps<{ file: string; name: string; revision: string; stacked?: boolean }>(), { stacked: false });

// Composed frames are drawn at most this wide, which keeps composing each frame cheap.
const MAX_WIDTH = 960;

const video = ref<HTMLVideoElement>();
const canvas = ref<HTMLCanvasElement>();
const composed = ref(props.stacked);
const playing = ref(false);
const muted = ref(true);
const failed = ref(false);
const position = ref(0);
const duration = ref(0);
let scratch: CanvasRenderingContext2D | null = null;
let pending = 0;

/** Draw the current frame on the canvas: its top half's colors with its bottom half as their alpha. */
function compose() {
  const element = video.value;
  const target = canvas.value;
  if (!composed.value || !element || !target || !element.videoWidth) return;
  const scale = Math.min(1, MAX_WIDTH / element.videoWidth);
  const width = Math.round(element.videoWidth * scale);
  const half = Math.floor((element.videoHeight * scale) / 2);
  if (!half) return;
  if (!scratch) scratch = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
  if (!scratch) return;
  if (scratch.canvas.width !== width || scratch.canvas.height !== half * 2) {
    scratch.canvas.width = width;
    scratch.canvas.height = half * 2;
  }
  scratch.drawImage(element, 0, 0, width, half * 2);
  const source = scratch.getImageData(0, 0, width, half * 2).data;
  if (target.width !== width || target.height !== half) {
    target.width = width;
    target.height = half;
  }
  const context = target.getContext('2d');
  if (!context) return;
  const frame = context.createImageData(width, half);
  const pixels = frame.data;
  const below = width * half * 4;
  for (let index = 0; index < below; index += 4) {
    pixels[index] = source[index];
    pixels[index + 1] = source[index + 1];
    pixels[index + 2] = source[index + 2];
    pixels[index + 3] = source[below + index];
  }
  context.putImageData(frame, 0, 0);
}

// Each new frame is composed and the time follows it: with requestVideoFrameCallback when the browser has it, otherwise
// on every animation frame while the movie plays.
type FrameVideo = HTMLVideoElement & { requestVideoFrameCallback?: (callback: () => void) => number; cancelVideoFrameCallback?: (handle: number) => void };
function onFrame() {
  const element = video.value as FrameVideo | undefined;
  if (!element) return;
  position.value = element.currentTime;
  compose();
  pending = element.requestVideoFrameCallback ? element.requestVideoFrameCallback(onFrame) : requestAnimationFrame(onFrame);
}
function stopFrames() {
  const element = video.value as FrameVideo | undefined;
  if (element?.cancelVideoFrameCallback) element.cancelVideoFrameCallback(pending);
  else cancelAnimationFrame(pending);
}
function onPlay() {
  playing.value = true;
  stopFrames();
  onFrame();
}
function onPause() {
  playing.value = false;
  if (!(video.value as FrameVideo | undefined)?.requestVideoFrameCallback) cancelAnimationFrame(pending);
}
function onLoaded() {
  duration.value = video.value?.duration ?? 0;
  compose();
}
function onSeeked() {
  position.value = video.value?.currentTime ?? 0;
  compose();
}

function toggle() {
  const element = video.value;
  if (!element) return;
  if (element.paused) element.play().catch(() => undefined);
  else element.pause();
}
function seek(event: Event) {
  const element = video.value;
  if (element) element.currentTime = Number((event.target as HTMLInputElement).value);
}
function toggleMuted() {
  muted.value = !muted.value;
  if (video.value) video.value.muted = muted.value;
}

watch(composed, () => requestAnimationFrame(compose));
watch(() => [props.file, props.revision], () => {
  failed.value = false;
  position.value = 0;
  duration.value = 0;
});
onBeforeUnmount(() => {
  stopFrames();
  const element = video.value;
  if (element) {
    element.pause();
    element.removeAttribute('src');
    element.load();
  }
});
</script>

<template>
  <ReportThumbnail v-if="failed" :file="file" :name="name" :revision="revision" :stacked="stacked" />
  <template v-else>
    <div :class="['thumbnail', 'movie', 'movie-preview', { dds: composed }]">
      <video ref="video" v-show="!composed" :src="reportPreviewURL(file, revision)" :aria-label="`${name}, playing`" autoplay loop muted playsinline
             preload="auto" @play="onPlay" @pause="onPause" @loadeddata="onLoaded" @seeked="onSeeked" @error="failed = true" />
      <canvas v-if="stacked" v-show="composed" ref="canvas" :aria-label="`${name} with its alpha`" role="img" />
    </div>
    <div class="movie-controls">
      <button type="button" class="btn btn-sm btn-secondary" :aria-label="playing ? 'Pause' : 'Play'" @click="toggle">
        <i aria-hidden="true" :class="['mdi', playing ? 'mdi-pause' : 'mdi-play']" />
      </button>
      <input class="movie-seek" type="range" min="0" :max="duration || 0" step="0.001" :value="position" :disabled="!duration" aria-label="Position" @input="seek">
      <small class="movie-time">{{ clock(position) }} / {{ duration ? clock(duration) : '…' }}</small>
      <button type="button" class="btn btn-sm btn-secondary" :aria-label="muted ? 'Unmute' : 'Mute'" :aria-pressed="!muted" @click="toggleMuted">
        <i aria-hidden="true" :class="['mdi', muted ? 'mdi-volume-off' : 'mdi-volume-high']" />
      </button>
      <span v-if="stacked" class="btn-group btn-group-sm" role="group" aria-label="How the movie is shown">
        <button type="button" :class="['btn', 'btn-secondary', { active: composed }]" :aria-pressed="composed" title="Its picture, transparent where its alpha is dark, as the game draws it" @click="composed = true">With alpha</button>
        <button type="button" :class="['btn', 'btn-secondary', { active: !composed }]" :aria-pressed="!composed" title="The picture above its alpha, as the file holds them" @click="composed = false">As encoded</button>
      </span>
    </div>
  </template>
</template>

<style scoped>
/* A movie as encoded plays on black; with its alpha, over the checkerboard of .thumbnail.dds. */
.movie-preview:not(.dds) { background: #111; }
.movie-preview video, .movie-preview canvas { display: block; width: 100%; height: 100%; object-fit: contain; }
.movie-controls { display: flex; align-items: center; gap: 8px; margin-top: 8px; }
.movie-seek { flex: 1; min-width: 80px; }
.movie-time { min-width: 110px; color: #6c757d; font-variant-numeric: tabular-nums; text-align: right; }
</style>
