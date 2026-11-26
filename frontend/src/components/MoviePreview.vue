<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { clock, reportPreviewURL } from '../format';
import { composeMovieAlpha, movieAlphaRects } from '../game/engine/GameVideoCtrl/movieAlpha';
import type { MovieAlphaFormat, MovieFacts } from '../types';
import ReportThumbnail from './ReportThumbnail.vue';

// A movie in the asset details, which plays only while they are open: it starts muted and loops, and closing the dialog
// stops it and lets the file go. A packed-alpha movie is composed over a checkerboard; "As encoded" shows the frames as the file
// holds them. A movie the browser cannot play shows its middle frame instead, as the backend decodes it.
const props = defineProps<{ file: string; name: string; revision: string; alphaFormat?: MovieAlphaFormat; facts?: MovieFacts }>();

// Composed frames are drawn at most this wide, which keeps composing each frame cheap.
const MAX_WIDTH = 960;

const video = ref<HTMLVideoElement>();
const canvas = ref<HTMLCanvasElement>();
const composed = ref(!!props.alphaFormat);
const playing = ref(false);
const muted = ref(true);
const failed = ref(false);
const position = ref(0);
const duration = ref(0);
const canStep = computed(() => (props.facts?.fps ?? 0) > 0 && Number.isFinite(duration.value) && duration.value > 0);
let pending = 0;
let heldDirection = 0;
let stepTimer = 0;

function compose() {
  const element = video.value;
  const target = canvas.value;
  if (!composed.value || !props.alphaFormat || !element || !target) return;
  if (element.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) return;
  const rects = movieAlphaRects(element.videoWidth, element.videoHeight, props.alphaFormat);
  if (!rects.width || !rects.height) return;
  const width = Math.min(rects.width, MAX_WIDTH);
  const height = Math.max(1, Math.round(rects.height * width / rects.width));
  if (target.width !== width || target.height !== height) {
    target.width = width;
    target.height = height;
  }
  const context = target.getContext('2d', { willReadFrequently: true });
  if (context) composeMovieAlpha(context, element, rects);
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
  stopStepping();
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
  stopStepping();
  const element = video.value;
  if (element) element.currentTime = Number((event.target as HTMLInputElement).value);
}

function moveFrame(direction: number) {
  const element = video.value;
  const fps = props.facts?.fps;
  if (!element || !fps || !canStep.value) return false;
  const last = Math.max(0, (props.facts?.frames || Math.round(duration.value * fps)) - 1);
  const current = Math.min(last, Math.floor(element.currentTime * fps + 0.001));
  const next = Math.max(0, Math.min(last, current + direction));
  if (next === current) return false;
  // Seek inside the frame to avoid landing on the previous frame at a rounded timestamp boundary.
  element.currentTime = (next + 0.5) / fps;
  return true;
}

function stopStepping() {
  window.clearTimeout(stepTimer);
  heldDirection = 0;
}

function repeatStep() {
  if (!heldDirection) return;
  if (!video.value?.seeking && !moveFrame(heldDirection)) {
    stopStepping();
    return;
  }
  stepTimer = window.setTimeout(repeatStep, 65);
}

function arrowDirection(event: KeyboardEvent) {
  return event.key === 'ArrowLeft' ? -1 : event.key === 'ArrowRight' ? 1 : 0;
}

function onPlaybackKeydown(event: KeyboardEvent) {
  if (!video.value || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  if (event.key === ' ') {
    // Focused buttons already handle Space through their native click behavior.
    if ((event.target as HTMLElement)?.closest('button')) return;
    event.preventDefault();
    event.stopPropagation();
    if (!event.repeat) toggle();
    return;
  }
  const direction = arrowDirection(event);
  if (!canStep.value || !direction) return;
  event.preventDefault();
  event.stopPropagation();
  // Use our own repeat so native keydown bursts do not replace seeks mid-decode.
  if (event.repeat) return;
  stopStepping();
  video.value.pause();
  if (moveFrame(direction)) {
    heldDirection = direction;
    stepTimer = window.setTimeout(repeatStep, 250);
  }
}

function releaseFrame(event: KeyboardEvent) {
  if (arrowDirection(event) === heldDirection) stopStepping();
}

function toggleMuted() {
  muted.value = !muted.value;
  if (video.value) video.value.muted = muted.value;
}

watch(composed, () => requestAnimationFrame(compose));
watch(() => props.alphaFormat, format => {
  composed.value = !!format;
  requestAnimationFrame(compose);
});
watch(() => [props.file, props.revision], () => {
  stopStepping();
  failed.value = false;
  position.value = 0;
  duration.value = 0;
});
onMounted(() => window.addEventListener('blur', stopStepping));
onBeforeUnmount(() => {
  window.removeEventListener('blur', stopStepping);
  stopStepping();
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
  <ReportThumbnail v-if="failed" :file="file" :name="name" :revision="revision" :alpha-format="alphaFormat" />
  <template v-else>
    <div :class="['thumbnail', 'movie', 'movie-preview', { dds: composed }]" role="group" aria-label="Movie preview"
         tabindex="0" :aria-keyshortcuts="canStep ? 'Space ArrowLeft ArrowRight' : 'Space'"
         :title="canStep ? 'Space to play or pause. Left and right arrows step one frame.' : 'Space to play or pause.'"
         @keydown="onPlaybackKeydown" @keyup="releaseFrame" @focusout="stopStepping">
      <video ref="video" v-show="!composed" :src="reportPreviewURL(file, revision)" :aria-label="`${name}, playing`" autoplay loop muted playsinline
             preload="auto" @play="onPlay" @pause="onPause" @loadeddata="onLoaded" @seeked="onSeeked" @error="failed = true" />
      <canvas v-if="alphaFormat" v-show="composed" ref="canvas" :aria-label="`${name} with its alpha`" role="img" />
    </div>
    <div class="movie-controls" @keydown="onPlaybackKeydown" @keyup="releaseFrame" @focusout="stopStepping">
      <button type="button" class="btn btn-sm btn-secondary" :aria-label="playing ? 'Pause' : 'Play'" @click="toggle">
        <i aria-hidden="true" :class="['mdi', playing ? 'mdi-pause' : 'mdi-play']" />
      </button>
      <input class="movie-seek" type="range" min="0" :max="duration || 0" step="0.001" :value="position" :disabled="!duration" aria-label="Position" @input="seek">
      <small class="movie-time">{{ clock(position) }} / {{ duration ? clock(duration) : '…' }}</small>
      <button type="button" class="btn btn-sm btn-secondary" :aria-label="muted ? 'Unmute' : 'Mute'" :aria-pressed="!muted" @click="toggleMuted">
        <i aria-hidden="true" :class="['mdi', muted ? 'mdi-volume-off' : 'mdi-volume-high']" />
      </button>
      <span v-if="alphaFormat" class="btn-group btn-group-sm" role="group" aria-label="How the movie is shown">
        <button type="button" :class="['btn', 'btn-secondary', { active: composed }]" :aria-pressed="composed" @click="composed = true">With alpha</button>
        <button type="button" :class="['btn', 'btn-secondary', { active: !composed }]" :aria-pressed="!composed" @click="composed = false">As encoded</button>
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
