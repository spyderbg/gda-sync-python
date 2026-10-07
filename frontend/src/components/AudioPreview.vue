<script lang="ts">
// The audio preview that plays: starting another one stops it, so only one plays at a time.
let current: HTMLAudioElement | undefined;
</script>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { extensionOf, reportPreviewURL } from '../format';

// An audio file the GDA sync report names, a game resource or a GDA file, in the look of ReportThumbnail, with a play
// and stop button. It plays once and never loops, and stop goes back to the start. With autoplay it starts playing when
// it opens, unless the browser only allows that after a click. Closing it stops it.
const props = defineProps<{ file: string; name: string; revision: string; autoplay?: boolean }>();

const audio = ref<HTMLAudioElement>();
const playing = ref(false);
const failed = ref(false);
const position = ref(0);
const duration = ref(0);
const extension = computed(() => extensionOf(props.name));
const progress = computed(() => (duration.value > 0 ? position.value / duration.value : 0));
// The waveform of AssetThumbnail, which fills in as the file plays.
const bars = Array.from({ length: 48 }, (_, i) => `${12 + Math.abs(Math.sin(i * 1.7)) * 52}px`);
let frame = 0;

/** Seconds as "1.4 s", or "2:05" from a minute on. */
const clock = (seconds: number) => (seconds < 60 ? `${seconds.toFixed(1)} s`
  : `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`);

function rewind(element: HTMLAudioElement) {
  element.pause();
  element.currentTime = 0;
}

function play() {
  const element = audio.value;
  if (!element || failed.value) return;
  if (current && current !== element) rewind(current);
  current = element;
  // Refused without a click, it stays stopped for the play button.
  element.play().catch(() => undefined);
}

function toggle() {
  if (!playing.value) play();
  else if (audio.value) rewind(audio.value);
}

// The position follows every frame while it plays: a short sound effect would otherwise move only once or twice.
function track() {
  position.value = audio.value?.currentTime ?? 0;
  frame = requestAnimationFrame(track);
}
function onPlay() {
  playing.value = true;
  cancelAnimationFrame(frame);
  track();
}
function onPause() {
  playing.value = false;
  cancelAnimationFrame(frame);
  position.value = audio.value?.currentTime ?? 0;
}
function onEnded() {
  onPause();
  if (audio.value) audio.value.currentTime = 0;
}
// A new file or report loads the file again, which stops it.
function onEmptied() {
  onPause();
  duration.value = 0;
}
function onDuration() {
  const value = audio.value?.duration ?? 0;
  duration.value = Number.isFinite(value) ? value : 0;
}
function onError() {
  onPause();
  failed.value = true;
}

watch(() => [props.file, props.revision], () => { failed.value = false; });
onMounted(() => { if (props.autoplay) play(); });
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (audio.value) rewind(audio.value);
  if (current === audio.value) current = undefined;
});
</script>

<template>
  <div :class="['thumbnail', 'audio', 'audio-preview', { 'is-playing': playing }]">
    <div class="generic-preview audio">
      <div class="waveform audio-waveform" aria-hidden="true">
        <i v-for="(height, i) in bars" :key="i" :class="{ 'is-played': (i + 0.5) / bars.length <= progress }" :style="{ height }" />
      </div>
      <button type="button" class="audio-toggle" :disabled="failed" :aria-label="`${playing ? 'Stop' : 'Play'} ${name}`" :title="playing ? 'Stop' : 'Play'" @click="toggle">
        <i aria-hidden="true" :class="['mdi', playing ? 'mdi-stop' : 'mdi-play']" />
      </button>
      <small class="audio-time">{{ failed ? 'This audio file cannot be played' : `${clock(position)} / ${duration ? clock(duration) : '…'}` }}</small>
    </div>
    <span v-if="extension" class="badge file-format">{{ extension.toUpperCase() }}</span>
    <audio ref="audio" :src="reportPreviewURL(file, revision)" preload="auto"
           @play="onPlay" @pause="onPause" @ended="onEnded" @emptied="onEmptied" @durationchange="onDuration" @error="onError" />
  </div>
</template>

<style scoped>
.audio-preview .audio-waveform { max-width: 90%; height: 72px; margin: 0 0 18px; overflow: hidden; }
.audio-waveform i { flex-shrink: 0; transition: opacity 0.1s; }
.audio-waveform i.is-played { opacity: 1; }
.audio-toggle { display: flex; align-items: center; justify-content: center; width: 52px; height: 52px; padding: 0; border: 0; border-radius: 50%; background: currentColor; color: inherit; cursor: pointer; }
.audio-toggle i { color: #fff; font-size: 30px; line-height: 1; }
.audio-toggle:hover:not(:disabled) { filter: brightness(0.92); }
.audio-toggle:disabled { opacity: 0.4; cursor: default; }
.audio-time { margin-top: 10px; font-size: 12px; font-variant-numeric: tabular-nums; }
</style>
