<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { reportPreviewURL, viewRenderURL } from '../format';
import type { ViewElement, ViewLayout } from '../types';

// One view of a large view preview's screen, as the game draws it. A view without an Anim that plays is the backend's
// render of all its elements. Otherwise each Anim whose image sequence has more than one frame plays as the game plays
// it (ImageSeqElement): a frame every frameTime milliseconds, loopCount times (0 repeats forever, each loop after the
// first starting at frame loopTo), each frame placed by its own size, between the backend's renders of the still
// elements drawn before and after it (segments), so that it stays over and under the elements it is between. The whole
// render is shown until every segment has loaded, and an Anim shows its first frame until all its frames have loaded.
const props = defineProps<{
  /** The view's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  resolution: { width: number; height: number };
  hidden: boolean;
  /** The view's elements, once loaded; until then the view is drawn whole, its Anims with their first frames. */
  layout: ViewLayout | null;
  /** Whether the Anims play; false keeps the frames shown. */
  playing: boolean;
  /** Changed to play every Anim again from its first frame. */
  restart: number;
}>();
const emit = defineEmits<{ error: [] }>();

/** The Anims that play, in drawing order: those the backend cuts its segments at (animated in egt_gda_sync/views.py). */
const anims = computed<ViewElement[]>(() => (props.layout?.elements ?? []).filter(element => element.type === 'Anim' && element.drawn
  && (element.frames ?? 0) > 1 && !!element.sequence?.length && !!element.placement && (props.hidden || !element.hidden)));
const segmentURL = (segment: number) => `${viewRenderURL(props.file, props.revision, props.resolution.width, props.hidden)}&segment=${segment}`;
const frameURL = (file: string) => reportPreviewURL(file, props.revision);

// The segments are shown once all of them have loaded, so that no still element disappears while they load.
const segmentsReady = ref(false);
let segmentLoad = 0;
watch(() => [anims.value.length, props.file, props.revision, props.hidden, props.resolution.width], () => {
  const current = ++segmentLoad;
  segmentsReady.value = false;
  if (!anims.value.length) return;
  void Promise.all(Array.from({ length: anims.value.length + 1 }, (_value, segment) => new Promise<boolean>(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = segmentURL(segment);
  }))).then(results => {
    if (current !== segmentLoad) return;
    if (results.every(Boolean)) segmentsReady.value = true;
    else emit('error');
  });
}, { immediate: true });

// The loaded images of the frames, by file, and the frame each Anim shows.
const images = ref(new Map<string, HTMLImageElement>());
const ready = ref<boolean[]>([]);
const shownFrames = ref<number[]>([]);
// Each Anim's loops played, whether its last loop ended, and the time since its frame was shown.
let loops: number[] = [];
let finished: boolean[] = [];
let elapsed: number[] = [];
let last = 0;
let handle = 0;
let generation = 0;

function load() {
  const current = ++generation;
  images.value = new Map();
  ready.value = anims.value.map(() => false);
  shownFrames.value = anims.value.map(() => 0);
  loops = anims.value.map(() => 0);
  finished = anims.value.map(() => false);
  elapsed = anims.value.map(() => 0);
  anims.value.forEach((anim, position) => {
    const files = [...new Set(anim.sequence!.map(frame => frame.file))];
    void Promise.all(files.map(file => new Promise<void>(resolve => {
      const image = new Image();
      image.onload = () => {
        if (current === generation) images.value.set(file, image);
        resolve();
      };
      image.onerror = () => resolve();
      image.src = frameURL(file);
    }))).then(() => {
      if (current !== generation) return;
      ready.value[position] = true;
      // The Anims start together, each once its frames are there.
      last = performance.now();
      run();
    });
  });
}
watch(anims, load, { immediate: true });
watch(() => props.restart, () => {
  shownFrames.value = anims.value.map(() => 0);
  loops = anims.value.map(() => 0);
  finished = anims.value.map(() => false);
  elapsed = anims.value.map(() => 0);
  last = performance.now();
  run();
});
watch(() => props.playing, () => { last = performance.now(); run(); });

/** The next frame of an Anim, or false when its last loop ended, which keeps its last frame. */
function advance(position: number) {
  const anim = anims.value[position];
  const count = anim.sequence!.length;
  if (shownFrames.value[position] < count - 1) {
    shownFrames.value[position]++;
    return true;
  }
  loops[position]++;
  if ((anim.loopCount ?? 1) > 0 && loops[position] >= (anim.loopCount ?? 1)) return false;
  const loopTo = anim.loopTo ?? 0;
  shownFrames.value[position] = loopTo > 0 && loopTo < count ? loopTo : 0;
  return true;
}

// Each Anim keeps its own time: its frames advance by its frameTime.
function tick(now: number) {
  const step = now - last;
  last = now;
  // After a pause, such as in a hidden tab, go on from the frames shown instead of catching up.
  const delta = step > 1000 ? 0 : step;
  anims.value.forEach((anim, position) => {
    if (!ready.value[position] || finished[position]) return;
    const frameTime = Math.max(anim.frameTime ?? 0, 1);
    elapsed[position] += delta;
    while (elapsed[position] >= frameTime) {
      elapsed[position] -= frameTime;
      if (!advance(position)) { finished[position] = true; break; }
    }
  });
  run();
}
function run() {
  cancelAnimationFrame(handle);
  if (props.playing && anims.value.some((_anim, position) => ready.value[position] && !finished[position])) handle = requestAnimationFrame(tick);
}
onBeforeUnmount(() => { generation++; segmentLoad++; cancelAnimationFrame(handle); });

/** An Anim's frame as it is drawn: its image, the part of it, its size, and its matrix for that size. */
function drawn(anim: ViewElement, position: number) {
  const frame = anim.sequence![shownFrames.value[position]] ?? anim.sequence![0];
  const image = images.value.get(frame.file);
  const [x, y, w, h] = frame.source ?? [0, 0, image?.naturalWidth ?? anim.size[0], image?.naturalHeight ?? anim.size[1]];
  // A frame of another size than the first is moved by its alignment's share of the difference (BaseElement::GetTransform).
  const [a, b, c, d, e, f] = anim.placement!.matrix;
  const [shareX, shareY] = anim.placement!.alignment;
  const dx = shareX * (w - anim.size[0]);
  const dy = shareY * (h - anim.size[1]);
  return {
    url: frameURL(frame.file), source: frame.source ? { x, y, w, h } : null, width: w, height: h,
    image: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
    matrix: `matrix(${a} ${b} ${c} ${d} ${e - a * dx - c * dy} ${f - b * dx - d * dy})`,
  };
}
const frames = computed(() => anims.value.map((anim, position) => ({ ...drawn(anim, position), opacity: (anim.alpha ?? 255) / 255 })));
</script>

<template>
  <svg v-if="anims.length && segmentsReady" class="view-stage-image view-render" :viewBox="`0 0 ${resolution.width} ${resolution.height}`" preserveAspectRatio="none"
       role="img" :aria-label="`${name} as the game draws it, with ${anims.length} animation${anims.length === 1 ? '' : 's'}`" :data-view="name" :data-anims="anims.length">
    <template v-for="segment in anims.length + 1" :key="segment">
      <image :href="segmentURL(segment - 1)" x="0" y="0" :width="resolution.width" :height="resolution.height" preserveAspectRatio="none" @error="emit('error')" />
      <g v-if="segment <= anims.length" class="view-anim" :data-element="anims[segment - 1].id" :data-frame="shownFrames[segment - 1]"
         :transform="frames[segment - 1].matrix" :opacity="frames[segment - 1].opacity">
        <svg v-if="frames[segment - 1].source && frames[segment - 1].image" :width="frames[segment - 1].width" :height="frames[segment - 1].height"
             :viewBox="`${frames[segment - 1].source!.x} ${frames[segment - 1].source!.y} ${frames[segment - 1].source!.w} ${frames[segment - 1].source!.h}`" preserveAspectRatio="none">
          <image :href="frames[segment - 1].url" :width="frames[segment - 1].image!.width" :height="frames[segment - 1].image!.height" />
        </svg>
        <image v-else-if="!frames[segment - 1].source" :href="frames[segment - 1].url" :width="frames[segment - 1].width" :height="frames[segment - 1].height" preserveAspectRatio="none" />
      </g>
    </template>
  </svg>
  <img v-else class="view-stage-image" :src="viewRenderURL(file, revision, resolution.width, hidden)" :alt="`${name} as the game draws it`" :data-view="name" @error="emit('error')">
</template>
