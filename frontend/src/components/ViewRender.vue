<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { reportPreviewURL, viewRenderURL } from '../format';
import type { ViewElement, ViewLayout } from '../types';

// One view of a large view preview's screen, as the game draws it. A view without an Anim that plays, or a moved element,
// is the backend's render of all its elements. Otherwise the page draws those elements itself, between the backend's
// renders of the other elements drawn before and after each (segments, cut at them), so that each stays over and under
// the elements it is between. Each Anim whose image sequence has more than one frame plays as the game plays it
// (ImageSeqElement): a frame every frameTime milliseconds, loopCount times (0 repeats forever, each loop after the first
// starting at frame loopTo), each frame placed by its own size; a moved element is drawn where it was moved to. Both are
// tinted and faded by their color. The segments shown change once all the new ones have loaded, so that no element
// disappears while they load, and an Anim shows its first frame until all its frames have loaded.
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
  /** How far each moved element is moved, by its index. */
  moves?: Record<number, [number, number]>;
}>();
const emit = defineEmits<{ error: [] }>();

/** The Anims that play, in drawing order: those the backend cuts its segments at (animated in egt_gda_sync/views.py). */
const anims = computed<ViewElement[]>(() => (props.layout?.elements ?? []).filter(element => element.type === 'Anim' && element.drawn
  && (element.frames ?? 0) > 1 && !!element.sequence?.length && !!element.placement && (props.hidden || !element.hidden)));
const frameURL = (file: string) => reportPreviewURL(file, props.revision);
const byIndex = computed(() => new Map((props.layout?.elements ?? []).map(element => [element.index, element])));
const animAt = computed(() => new Map(anims.value.map((anim, position) => [anim.index, position])));

/** The elements the page draws itself, in drawing order: the Anims that play and the moved elements that draw an image. */
const live = computed(() => (props.layout?.elements ?? []).filter(element => element.drawn && element.type !== 'Dummy' && !!element.placement
  && (props.hidden || !element.hidden) && (animAt.value.has(element.index) || !!props.moves?.[element.index])));
// The segments, cut at the elements drawn live: those shown, and the next ones while they load.
interface Segments { key: string; indices: number[]; urls: string[] }
const wanted = computed<Segments>(() => {
  const indices = live.value.map(element => element.index);
  const key = `${viewRenderURL(props.file, props.revision, props.resolution.width, props.hidden)}&cuts=${indices.join(',')}`;
  return { key, indices, urls: indices.length ? Array.from({ length: indices.length + 1 }, (_value, segment) => `${key}&segment=${segment}`) : [] };
});
const shown = ref<Segments | null>(null);
let segmentLoad = 0;
watch(() => wanted.value.key, () => {
  const current = ++segmentLoad;
  const next = wanted.value;
  if (!next.indices.length) { shown.value = null; return; }
  void Promise.all(next.urls.map(url => new Promise<boolean>(resolve => {
    const image = new Image();
    image.onload = () => resolve(true);
    image.onerror = () => resolve(false);
    image.src = url;
  }))).then(results => {
    if (current !== segmentLoad) return;
    if (results.every(Boolean)) shown.value = next;
    else emit('error');
  });
}, { immediate: true });

// The images of the moved elements that are not Anims, for the size of an image that a source rectangle is cut from.
const stills = ref(new Map<string, HTMLImageElement>());
watch(live, elements => {
  for (const element of elements) {
    if (!element.file || !element.source || stills.value.has(element.file) || animAt.value.has(element.index)) continue;
    const file = element.file;
    const image = new Image();
    image.onload = () => { stills.value.set(file, image); };
    image.src = frameURL(file);
  }
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

/** An element drawn live: its image, or an Anim's frame, the part of it, its size, and its matrix for that size where it
 * was moved to, with its fade and tint. */
function drawn(element: ViewElement) {
  const position = animAt.value.get(element.index);
  const frame = position !== undefined ? element.sequence![shownFrames.value[position]] ?? element.sequence![0]
    : { file: element.file!, source: element.source as [number, number, number, number] | undefined };
  const image = position !== undefined ? images.value.get(frame.file) : stills.value.get(frame.file);
  const [x, y, w, h] = frame.source ?? [0, 0, position !== undefined ? image?.naturalWidth ?? element.size[0] : element.size[0],
    position !== undefined ? image?.naturalHeight ?? element.size[1] : element.size[1]];
  // A frame of another size than the first is moved by its alignment's share of the difference (BaseElement::GetTransform),
  // and a moved element by how far it was moved.
  const [a, b, c, d, e, f] = element.placement!.matrix;
  const [shareX, shareY] = element.placement!.alignment;
  const dx = shareX * (w - element.size[0]);
  const dy = shareY * (h - element.size[1]);
  const [moveX, moveY] = props.moves?.[element.index] ?? [0, 0];
  const [red, green, blue, alpha] = element.color ?? [255, 255, 255, element.alpha ?? 255];
  return {
    index: element.index, id: element.id, anim: position !== undefined, frame: position !== undefined ? shownFrames.value[position] : undefined,
    url: frameURL(frame.file), source: frame.source ? { x, y, w, h } : null, width: w, height: h,
    image: image ? { width: image.naturalWidth, height: image.naturalHeight } : null,
    matrix: `matrix(${a} ${b} ${c} ${d} ${e - a * dx - c * dy + moveX} ${f - b * dx - d * dy + moveY})`,
    opacity: alpha / 255,
    tint: red < 255 || green < 255 || blue < 255 ? `${red / 255} 0 0 0 0 0 ${green / 255} 0 0 0 0 0 ${blue / 255} 0 0 0 0 0 1 0` : null,
  };
}
// The elements drawn live between the segments shown, in drawing order, where they are now.
const items = computed(() => (shown.value?.indices ?? []).map(index => byIndex.value.get(index)).map(element => (element ? drawn(element) : null)));
const animCount = computed(() => items.value.filter(item => item?.anim).length);
// Tint filters need ids of their own on the page.
const uid = `view-render-${Math.random().toString(36).slice(2, 10)}`;
</script>

<template>
  <svg v-if="shown" class="view-stage-image view-render" :viewBox="`0 0 ${resolution.width} ${resolution.height}`" preserveAspectRatio="none"
       role="img" :aria-label="`${name} as the game draws it${animCount ? `, with ${animCount} animation${animCount === 1 ? '' : 's'}` : ''}`" :data-view="name" :data-anims="animCount">
    <defs>
      <template v-for="item in items" :key="item?.index">
        <filter v-if="item?.tint" :id="`${uid}-${item.index}`" color-interpolation-filters="sRGB"><feColorMatrix type="matrix" :values="item.tint" /></filter>
      </template>
    </defs>
    <template v-for="(item, position) in [null, ...items]" :key="position">
      <g v-if="item" :class="['view-live', { 'view-anim': item.anim }]" :data-element="item.id" :data-frame="item.frame" :transform="item.matrix" :opacity="item.opacity"
         :filter="item.tint ? `url(#${uid}-${item.index})` : undefined">
        <svg v-if="item.source && item.image" :width="item.width" :height="item.height" :viewBox="`${item.source.x} ${item.source.y} ${item.source.w} ${item.source.h}`" preserveAspectRatio="none">
          <image :href="item.url" :width="item.image.width" :height="item.image.height" />
        </svg>
        <image v-else-if="!item.source" :href="item.url" :width="item.width" :height="item.height" preserveAspectRatio="none" />
      </g>
      <image :href="shown.urls[position]" x="0" y="0" :width="resolution.width" :height="resolution.height" preserveAspectRatio="none" @error="emit('error')" />
    </template>
  </svg>
  <img v-else class="view-stage-image" :src="viewRenderURL(file, revision, resolution.width, hidden)" :alt="`${name} as the game draws it`" :data-view="name" @error="emit('error')">
</template>
