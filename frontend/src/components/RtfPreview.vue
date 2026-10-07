<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, reactive, ref, watch, type CSSProperties } from 'vue';
import { baseName, firstRtfPage, number, plural, reportPreviewURL } from '../format';
import type { RtfFacts, RtfLayout, RtfLayoutPage, RtfRun, RtfSection, RtfStyle } from '../types';
import CheckBox from './CheckBox.vue';

// The pages of an RTF, a project of the RTF Tool such as a game's help screens. A card shows the chosen page's
// background, and a strip of the backgrounds of all its pages to choose from, the first page with a background at
// first; clicking the page itself opens the details. A large preview draws the chosen page approximately as the game
// does: the page at its own resolution, scaled to fit, with its background and each text section in its rectangle,
// aligned, in its style and in the chosen language, with inline images and a video's first frame, and drawn smaller
// when it does not fit. A paytable figure, which the game computes, and a variable that the game fills in are outlined;
// an image that does not exist is a dashed box with its id. The text is drawn with the app's own font, not the game's.
// The large preview loads the layout of the pages from the report preview endpoint. Text areas outlines every section
// with its name, in the color the RTF Tool outlines the page's sections with.
const props = withDefaults(defineProps<{
  /** The project's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  facts: RtfFacts;
  large?: boolean;
}>(), { large: false });
const chosen = defineModel<number>('page');

// A large preview is at most this share of the window's height.
const STAGE_HEIGHT = 0.58;
const FALLBACK_STYLE: RtfStyle = { face: 'Regular', weight: 400, size: 40, fill: ['#ffffff'], letterSpacing: 0, lineSpacing: 0 };
const AREA_COLOR = '#0061ff';

const failed = reactive(new Set<string>());
const url = (file: string) => reportPreviewURL(file, props.revision);
const shows = (file: string | null): file is string => !!file && !failed.has(file);
const fail = (file: string | null) => { if (file) failed.add(file); };
// The page shown: the one chosen, or at first the first page with a background.
const index = computed(() => (chosen.value !== undefined && chosen.value < props.facts.pages.length ? chosen.value : firstRtfPage(props.facts)));
const page = computed(() => props.facts.pages[index.value] ?? null);
watch(() => [props.file, props.revision], () => { failed.clear(); });

const layout = ref<RtfLayout | null>(null);
const state = ref<'loading' | 'ready' | 'failed'>('loading');
const error = ref('');
const language = ref('');
const areas = ref(false);
let request = 0;

async function load() {
  const id = ++request;
  state.value = 'loading';
  try {
    const response = await fetch(url(props.file));
    const body = await response.json().catch(() => null);
    if (id !== request) return;
    if (!response.ok || !body) throw new Error(body?.error || 'The pages could not be loaded');
    layout.value = body as RtfLayout;
    if (!layout.value.languages.includes(language.value)) language.value = layout.value.languages[0] ?? '';
    state.value = 'ready';
  } catch (e) {
    if (id !== request) return;
    error.value = (e as Error).message;
    state.value = 'failed';
  }
}
watch(() => [props.large, props.file, props.revision], () => { if (props.large) void load(); }, { immediate: true });

const shown = computed<RtfLayoutPage | null>(() => layout.value?.pages[index.value] ?? null);
const styleOf = (name?: string) => (name && layout.value?.styles[name]) || FALLBACK_STYLE;

// The page is drawn at its own resolution, then scaled to the width of the stage and the height it may have.
const stage = ref<HTMLElement>();
const width = ref(0);
const observer = new ResizeObserver(entries => { width.value = entries[0]?.contentRect.width ?? 0; });
watch(stage, (element, previous) => {
  if (previous) observer.unobserve(previous);
  if (element) observer.observe(element);
});
// A section's text that does not fit its rectangle is drawn smaller, as the RTF Tool draws it, from the side it is
// aligned to. Its size changes when its images load, and with the language.
const pageElement = ref<HTMLElement>();
const fitter = new ResizeObserver(entries => { for (const entry of entries) fitText(entry.target as HTMLElement); });
function fitText(text: HTMLElement) {
  const section = text.parentElement;
  if (!section?.clientWidth || !section.clientHeight || !text.offsetWidth || !text.offsetHeight) return;
  const fit = Math.min(1, section.clientWidth / text.offsetWidth, section.clientHeight / text.offsetHeight);
  text.style.transform = fit < 1 ? `scale(${fit})` : '';
}
watch([pageElement, shown, language], async () => {
  await nextTick();
  fitter.disconnect();
  pageElement.value?.querySelectorAll<HTMLElement>('.rtf-section-text').forEach(text => fitter.observe(text));
}, { flush: 'post' });
onBeforeUnmount(() => {
  observer.disconnect();
  fitter.disconnect();
});
const scale = computed(() => {
  const current = shown.value;
  if (!current || !width.value) return 0;
  return Math.min(width.value / current.width, window.innerHeight * STAGE_HEIGHT / current.height);
});
const pageStyle = computed(() => {
  const current = shown.value;
  if (!current) return {};
  return {
    width: `${current.width}px`, height: `${current.height}px`, transform: `scale(${scale.value})`,
    left: `${(width.value - current.width * scale.value) / 2}px`, '--rtf-area': current.color ?? AREA_COLOR,
  };
});

function sectionStyle(section: RtfSection) {
  const style = styleOf(section.style);
  const text = textOf(section);
  return {
    left: `${section.x}px`, top: `${section.y}px`, width: `${section.w}px`, height: `${section.h}px`,
    fontSize: `${style.size}px`, lineHeight: `calc(1.2em + ${style.lineSpacing}px)`,
    textTransform: text?.case === 'uppercase' ? 'uppercase' as const : undefined,
    fontVariant: text?.case === 'small_caps' ? 'small-caps' : undefined,
  };
}

/** How a run's text is drawn in a style: its weight, size, spacing and fill, a gradient clipped to each line, and its
 * outline and shadow as drop shadows, which follow the shapes of the letters. */
function runStyle(name?: string): CSSProperties {
  const style = styleOf(name);
  const filters: string[] = [];
  if (style.outline) {
    const { color, width: line } = style.outline;
    for (const [x, y] of [[line, 0], [-line, 0], [0, line], [0, -line]]) filters.push(`drop-shadow(${x}px ${y}px 0 ${color})`);
  }
  if (style.shadow) filters.push(`drop-shadow(${style.shadow.x}px ${style.shadow.y}px ${style.shadow.blur * style.size / 10}px ${style.shadow.color})`);
  const fill: CSSProperties = style.fill.length > 1
    ? { backgroundImage: `linear-gradient(${style.fill.join(', ')})`, backgroundClip: 'text', WebkitBackgroundClip: 'text', color: 'transparent',
        boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }
    : { color: style.fill[0] };
  return {
    fontWeight: style.weight, fontSize: `${style.size}px`, letterSpacing: `${style.letterSpacing}px`, ...fill,
    ...(filters.length ? { filter: filters.join(' ') } : {}),
  };
}

/** The height an inline image or video may have: its section's or its own style's size, times the text's image scale. */
const imageHeight = (section: RtfSection, run: { scale: number; style?: string }) => styleOf(run.style ?? section.style).size * run.scale;
const textOf = (section: RtfSection) => section.texts[language.value] ?? Object.values(section.texts)[0];
const runsOf = (section: RtfSection): RtfRun[] => textOf(section)?.runs ?? [];
const media = (run: RtfRun) => ('image' in run ? run.image : 'video' in run ? run.video : null);
const missingSummary = computed(() => `${number(props.facts.missingCount)} missing file${plural(props.facts.missingCount)}`);
</script>

<template>
  <div v-if="!large" class="rtf-preview">
    <button type="button" class="rtf-preview-open" :aria-label="`Inspect ${name}`">
      <div class="thumbnail rtf-preview-page">
        <img v-if="page && shows(page.background) && page.found" :src="url(page.background)" :alt="`${page.id} page of ${name}`" loading="lazy" @error="fail(page.background)">
        <div v-else class="generic-preview rtf">
          <i aria-hidden="true" :class="['mdi', page ? 'mdi-image-off-outline' : 'mdi-book-open-page-variant-outline']" />
          <small>{{ page ? 'No background' : 'No pages' }}</small>
        </div>
        <span class="badge file-format">RTF</span>
        <span v-if="page" class="rtf-preview-caption">{{ page.id }} · {{ page.width }} × {{ page.height }}</span>
      </div>
    </button>
    <div v-if="facts.pages.length > 1" class="rtf-preview-strip" role="group" :aria-label="`Pages of ${name}`">
      <button v-for="(item, i) in facts.pages" :key="item.id" type="button" :class="['rtf-preview-thumb', { active: i === index }]"
              :aria-pressed="i === index" :aria-label="`Show page ${item.id}`" :title="item.id" @click.stop="chosen = i">
        <img v-if="item.found && shows(item.background)" :src="url(item.background)" alt="" loading="lazy" @error="fail(item.background)">
        <i v-else aria-hidden="true" class="mdi mdi-image-off-outline" />
      </button>
    </div>
  </div>

  <div v-else class="rtf-viewer">
    <div class="rtf-viewer-toolbar">
      <div v-if="(layout?.languages.length ?? 0) > 1" class="btn-group btn-group-sm" role="group" aria-label="Language">
        <button v-for="item in layout?.languages" :key="item" type="button" :class="['btn', 'btn-secondary', { active: item === language }]" :aria-pressed="item === language" @click="language = item">{{ item }}</button>
      </div>
      <CheckBox :checked="areas" label="Show text areas" @change="areas = $event">Text areas</CheckBox>
      <span v-if="facts.missingCount" class="rtf-viewer-missing"><i aria-hidden="true" class="mdi mdi-alert-outline" />{{ missingSummary }}</span>
    </div>
    <div ref="stage" class="rtf-stage" :style="{ height: shown && scale ? `${shown.height * scale}px` : undefined }">
      <p v-if="state !== 'ready'" class="rtf-stage-state text-muted">
        <i aria-hidden="true" :class="['mdi', state === 'loading' ? 'mdi-loading mdi-spin' : 'mdi-alert-circle-outline text-danger']" />{{ state === 'loading' ? 'Loading the pages…' : error }}
      </p>
      <div v-else-if="shown" ref="pageElement" :class="['rtf-page', { 'show-areas': areas }]" :style="pageStyle" role="group" :aria-label="`Page ${shown.id}`">
        <img v-if="shown.found && shows(shown.background)" class="rtf-page-background" :src="url(shown.background)" alt="" @error="fail(shown.background)">
        <div v-else class="rtf-page-missing"><i aria-hidden="true" class="mdi mdi-image-off-outline" />{{ shown.background ? `${baseName(shown.background)} does not exist` : 'The background is not mapped' }}</div>
        <div v-for="section in shown.sections" :key="section.id" :class="['rtf-section', `is-${section.horizontal}`, `is-${section.vertical}`, { 'is-wrapped': section.wrap }]"
             :style="sectionStyle(section)" :title="`${section.id} · ${section.style}${section.variants > 1 ? ` · ${section.variants} variants` : ''}`" :data-section="section.id">
          <div class="rtf-section-text">
            <template v-for="(run, index) in runsOf(section)" :key="index">
              <span v-if="'text' in run" :style="runStyle(run.style ?? section.style)">{{ run.text }}</span>
              <template v-else-if="'image' in run || 'video' in run">
                <img v-if="run.found && shows(media(run))" :class="['rtf-inline', { 'is-video': 'video' in run }]" :src="url(media(run)!)" :style="{ maxHeight: `${imageHeight(section, run)}px` }"
                     :alt="run.id" :title="'video' in run ? `${run.id}, ${number(run.frames)} frames at ${run.fps} fps` : run.id" @error="fail(media(run))">
                <span v-else class="rtf-placeholder is-missing" :style="{ height: `${Math.min(imageHeight(section, run), section.h)}px` }" :title="`${run.id} does not exist`">{{ run.id }}</span>
              </template>
              <span v-else-if="'figure' in run" class="rtf-placeholder" :style="runStyle(run.style ?? section.style)" title="A win that the game computes">{{ run.figure }}</span>
              <span v-else-if="'variable' in run" :class="{ 'rtf-placeholder': !run.value }" :style="runStyle(run.style ?? section.style)"
                    :title="run.value ? `${run.variable}, as the project names it` : 'A value that the game fills in'">{{ run.value ?? run.variable }}</span>
            </template>
          </div>
          <small v-if="areas" class="rtf-section-name">{{ section.id }}</small>
        </div>
      </div>
    </div>
    <div v-if="facts.pages.length" class="rtf-preview-strip is-large" role="group" :aria-label="`Pages of ${name}`">
      <button v-for="(item, i) in facts.pages" :key="item.id" type="button" :class="['rtf-preview-thumb', { active: i === index }]"
              :aria-pressed="i === index" :aria-label="`Show page ${item.id}`" @click="chosen = i">
        <span class="rtf-preview-thumb-image">
          <img v-if="item.found && shows(item.background)" :src="url(item.background)" alt="" loading="lazy" @error="fail(item.background)">
          <i v-else aria-hidden="true" class="mdi mdi-image-off-outline" />
        </span>
        <small>{{ item.id }}</small>
      </button>
    </div>
    <p class="rtf-viewer-note text-muted">
      <template v-if="page">{{ page.id }} · {{ page.width }} × {{ page.height }}{{ page.standard ? ` ${page.standard}` : '' }} · {{ number(page.sections) }} text section{{ plural(page.sections) }}. </template>
      Drawn approximately, with the app's font; wins the game computes and values it fills in are outlined.
    </p>
  </div>
</template>

<style scoped>
.rtf-preview { display: flex; flex-direction: column; }
.rtf-preview-open { display: block; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.rtf-preview-open:focus-visible { outline-offset: -2px; }
.rtf-preview-page { background: #1d1f2b; }
.rtf-preview-page img { object-fit: contain; }
.rtf-preview-page .generic-preview small { margin-top: 6px; font-size: 11px; }
.rtf-preview-caption { position: absolute; right: 10px; bottom: 10px; max-width: calc(100% - 70px); padding: 1px 6px; overflow: hidden; border-radius: 3px; background: rgba(29, 31, 43, 0.75); color: #fff; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.rtf-preview-strip { display: flex; gap: 4px; padding: 6px 1.15rem 0; overflow-x: auto; }
.rtf-preview-thumb { display: flex; flex: 0 0 auto; align-items: center; justify-content: center; width: 48px; height: 27px; padding: 0; overflow: hidden; border: 1px solid #e0e5e9; border-radius: 3px; background: #1d1f2b; color: #8a939c; cursor: pointer; }
.rtf-preview-thumb img { width: 100%; height: 100%; object-fit: cover; }
.rtf-preview-thumb.active { border-color: #4b49ac; box-shadow: 0 0 0 1px #4b49ac; }
.rtf-preview-strip.is-large { gap: 8px; padding: 10px 0 0; }
.rtf-preview-strip.is-large .rtf-preview-thumb { flex-direction: column; width: 112px; height: auto; padding: 0 0 4px; background: #fff; color: #6c757d; }
.rtf-preview-strip.is-large .rtf-preview-thumb small { max-width: 100%; padding: 0 4px; overflow: hidden; font-size: 10px; text-overflow: ellipsis; white-space: nowrap; }
.rtf-preview-thumb-image { display: flex; align-items: center; justify-content: center; width: 100%; height: 63px; margin-bottom: 3px; background: #1d1f2b; }
.rtf-preview-thumb-image img { width: 100%; height: 100%; object-fit: contain; }
.rtf-viewer-toolbar { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; margin-bottom: 8px; }
.rtf-viewer-toolbar :deep(.form-check) { margin: 0; font-size: 12px; }
.rtf-viewer-missing { display: flex; gap: 4px; margin-left: auto; color: #d2453c; font-size: 12px; }
.rtf-stage { position: relative; min-height: 120px; overflow: hidden; border-radius: 4px; background: #1d1f2b; }
.rtf-stage-state { display: flex; gap: 6px; align-items: center; justify-content: center; height: 200px; margin: 0; }
.rtf-page { position: absolute; top: 0; overflow: hidden; background: #000; transform-origin: 0 0; font-family: inherit; }
.rtf-page-background { position: absolute; inset: 0; width: 100%; height: 100%; }
.rtf-page-missing { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 16px; height: 100%; color: #8a939c; font-size: 40px; }
.rtf-page-missing i { font-size: 120px; }
.rtf-section { --fit-x: center; --fit-y: center; position: absolute; display: flex; flex-direction: column; align-items: center; justify-content: center; }
.rtf-section.is-top { --fit-y: top; justify-content: flex-start; }
.rtf-section.is-bottom { --fit-y: bottom; justify-content: flex-end; }
.rtf-section.is-left { --fit-x: left; align-items: flex-start; }
.rtf-section.is-right { --fit-x: right; align-items: flex-end; }
/* The text's own size, which fitText compares with its section's. */
.rtf-section-text { flex: none; width: max-content; text-align: center; white-space: pre; transform-origin: var(--fit-x) var(--fit-y); }
.rtf-section.is-wrapped .rtf-section-text { width: 100%; white-space: pre-wrap; overflow-wrap: break-word; }
.rtf-section.is-left .rtf-section-text { text-align: left; }
.rtf-section.is-right .rtf-section-text { text-align: right; }
.rtf-inline { max-width: 100%; vertical-align: middle; }
.rtf-placeholder { outline: 2px dashed rgba(255, 255, 255, 0.65); outline-offset: 2px; }
.rtf-placeholder.is-missing { display: inline-flex; align-items: center; justify-content: center; min-width: 2em; max-width: 100%; padding: 0 0.3em; outline-color: #ff6b5e; color: #ff6b5e; font-size: 0.4em; vertical-align: middle; }
.rtf-page.show-areas .rtf-section { outline: 2px dashed var(--rtf-area); outline-offset: -1px; }
.rtf-section-name { position: absolute; top: 0; left: 0; padding: 1px 6px; background: var(--rtf-area); color: #fff; font-size: 16px; font-weight: 500; line-height: 1.3; text-transform: none; letter-spacing: 0; white-space: nowrap; }
.rtf-viewer-note { margin: 8px 0 0; font-size: 12px; }
</style>
