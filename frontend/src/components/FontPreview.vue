<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, useId, watch } from 'vue';
import { characterRanges, codePoint, number, reportPreviewURL, size as fileSize } from '../format';
import type { FontFacts } from '../types';

// A font file drawn with itself. The browser loads it from the report preview endpoint into a FontFace, which the text
// below uses by its own family name; the response also brings the font's names and the samples of the writing systems
// it can draw. A card loads the font once it scrolls into view, and does not load one larger than CARD_LIMIT until
// asked; it shows two characters and a sample line of the font's first writing system. A large preview is a specimen:
// the font's name, its alphabets and digits, a sample of each other writing system, a waterfall of text to type at
// several sizes, the declared one among them, and the declared characters, a row for each range, with the ones the font
// misses marked.
const props = withDefaults(defineProps<{
  /** The font's absolute path, as the report stores it. */
  file: string;
  name: string;
  revision: string;
  large?: boolean;
  /** A Font entry's declared characters, such as "[U+0020-U+00FF]", and its size in pixels. */
  chars?: string;
  size?: number;
  /** The declared characters the font misses, from the backend's check. */
  missing?: number[];
  /** The text to draw, shared by previews shown side by side. */
  text?: string;
}>(), { large: false, chars: '', size: 0, missing: () => [], text: '' });
const emit = defineEmits<{ 'update:text': [text: string] }>();

const CARD_LIMIT = 2 * 1024 * 1024;
const FALLBACK = { script: 'Latin', pair: 'Aa', text: 'The quick brown fox jumps over the lazy dog.' };
const ALPHABETS = ['abcdefghijklmnopqrstuvwxyz', 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', '0123456789.:,;(*!?\')'];
const WATERFALL = [12, 16, 20, 24, 32, 40, 48, 60, 72];
const family = `font-preview-${useId()}`;
const state = ref<'idle' | 'loading' | 'ready' | 'large' | 'failed'>('idle');
const bytes = ref(0);
const error = ref('');
const facts = ref<FontFacts | null>(null);
const root = ref<HTMLElement>();
let face: FontFace | null = null;
let observer: IntersectionObserver | null = null;
let request = 0;

const fontStyle = computed(() => ({ fontFamily: `"${family}"` }));
// Without the font's samples, as from an older backend, it is shown as a Latin font.
const samples = computed(() => (facts.value?.samples?.length ? facts.value.samples : facts.value?.samples ? [] : [FALLBACK]));
const first = computed(() => samples.value[0] ?? FALLBACK);
const latin = computed(() => samples.value.some(sample => sample.script === 'Latin'));
const others = computed(() => samples.value.filter(sample => sample.script !== 'Latin'));
const title = computed(() => (facts.value?.family ? `${facts.value.family}${facts.value.style ? `, ${facts.value.style}` : ''}` : props.name));
// The waterfall's sizes, with the declared one.
const sizes = computed(() => [...new Set([...WATERFALL, ...(props.size ? [props.size] : [])])].sort((a, b) => a - b));
const ranges = computed(() => characterRanges(props.chars));
const missingSet = computed(() => new Set(props.missing));
const typed = ref(props.text);
watch(() => props.text, text => { typed.value = text; });

function release() {
  if (face) document.fonts.delete(face);
  face = null;
}

function readFacts(response: Response) {
  const header = response.headers.get('x-font-facts');
  try {
    return header ? JSON.parse(decodeURIComponent(header)) as FontFacts : null;
  } catch {
    return null;
  }
}

async function load(force = false) {
  const id = ++request;
  release();
  state.value = 'loading';
  try {
    const response = await fetch(reportPreviewURL(props.file, props.revision));
    if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'The font could not be loaded');
    const length = Number(response.headers.get('content-length') || 0);
    if (!props.large && !force && length > CARD_LIMIT) {
      void response.body?.cancel();
      if (id === request) {
        bytes.value = length;
        state.value = 'large';
      }
      return;
    }
    const found = readFacts(response);
    const loaded = await new FontFace(family, await response.arrayBuffer()).load().catch(() => {
      throw new Error('The browser cannot draw this font');
    });
    if (id !== request) return;
    face = loaded;
    facts.value = found;
    document.fonts.add(loaded);
    state.value = 'ready';
  } catch (e) {
    if (id !== request) return;
    error.value = (e as Error).message;
    state.value = 'failed';
  }
}

onMounted(() => {
  if (props.large || !('IntersectionObserver' in window)) {
    void load();
    return;
  }
  observer = new IntersectionObserver(entries => {
    if (!entries.some(entry => entry.isIntersecting)) return;
    observer?.disconnect();
    observer = null;
    void load();
  }, { rootMargin: '200px' });
  observer.observe(root.value!);
});
watch(() => [props.file, props.revision], () => { if (state.value !== 'idle') void load(); });
onBeforeUnmount(() => {
  request++;
  observer?.disconnect();
  release();
});

function input(event: Event) {
  typed.value = (event.target as HTMLInputElement).value;
  emit('update:text', typed.value);
}
</script>

<template>
  <div ref="root" :class="['font-preview', { 'is-large': large }]">
    <template v-if="state === 'ready' && !large">
      <span class="font-preview-glyphs" :style="fontStyle">{{ first.pair }}</span>
      <span class="font-preview-line" :style="fontStyle" dir="auto">{{ first.text }}</span>
    </template>
    <div v-else-if="state === 'ready'" class="font-preview-specimen">
      <p class="font-specimen-title" :style="fontStyle">{{ title }}</p>
      <template v-if="latin">
        <p v-for="line in ALPHABETS" :key="line" class="font-specimen-alphabet" :style="fontStyle">{{ line }}</p>
      </template>
      <section v-for="sample in others" :key="sample.script" class="font-specimen-sample">
        <small>{{ sample.script }}</small>
        <p :style="fontStyle" dir="auto">{{ sample.text }}</p>
      </section>
      <p v-if="!samples.length" class="font-specimen-note">The font has none of the sample texts; the declared characters are below.</p>

      <label class="font-preview-label">
        <span>Text for the sizes below</span>
        <input type="text" class="form-control form-control-sm" :value="typed" :placeholder="first.text" :aria-label="`Text to draw with ${name}`" @input="input">
      </label>
      <div class="font-specimen-waterfall">
        <p v-for="pixels in sizes" :key="pixels" :class="{ 'is-declared': pixels === size }">
          <small>{{ pixels }}<template v-if="pixels === size"> px, declared</template></small>
          <span :style="{ ...fontStyle, fontSize: `${pixels}px` }" dir="auto">{{ typed || first.text }}</span>
        </p>
      </div>

      <template v-if="ranges.length">
        <h6 class="font-specimen-heading">Declared characters</h6>
        <section v-for="range in ranges" :key="range.label" class="font-preview-range">
          <small>{{ range.label }}<template v-if="range.count > range.points.length"> · the first {{ number(range.points.length) }} of {{ number(range.count) }}</template></small>
          <p :style="{ ...fontStyle, fontSize: `${Math.min(48, Math.max(18, size || 28))}px` }">
            <span v-for="point in range.points" :key="point" :class="{ 'is-missing': missingSet.has(point) }" :title="missingSet.has(point) ? `${codePoint(point)} is not in the font` : codePoint(point)">{{ String.fromCodePoint(point) }}</span>
          </p>
        </section>
      </template>
    </div>
    <div v-else class="font-preview-state">
      <i aria-hidden="true" :class="['mdi', state === 'loading' ? 'mdi-loading mdi-spin' : state === 'failed' ? 'mdi-alert-circle-outline' : 'mdi-format-font']" />
      <span v-if="state === 'large'">{{ fileSize(bytes) }} font <button type="button" class="btn btn-link btn-sm p-0" @click.stop="load(true)">Load preview</button></span>
      <span v-else-if="state === 'failed'">{{ error }}</span>
      <span v-else-if="state === 'loading'">Loading the font…</span>
    </div>
  </div>
</template>

<style scoped>
.font-preview { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; height: 100%; padding: 8px 12px; overflow: hidden; background: #fbfaff; color: #333; text-align: center; font-synthesis: none; }
.font-preview-glyphs { font-size: 56px; line-height: 1.1; }
.font-preview-line { max-width: 100%; overflow: hidden; font-size: 15px; text-overflow: ellipsis; white-space: nowrap; }
.font-preview-state { display: flex; flex-direction: column; align-items: center; gap: 6px; color: #8862e0; font-size: 12px; }
.font-preview-state i { font-size: 40px; line-height: 1; }
.font-preview-state span { color: #6c757d; }
.font-preview.is-large { display: block; height: auto; max-height: 60vh; padding: 16px 20px; overflow-y: auto; text-align: left; }
.font-preview.is-large .font-preview-state { justify-content: center; min-height: 200px; }
.font-preview-specimen p { margin: 0; overflow-wrap: anywhere; }
.font-specimen-title { margin-bottom: 8px !important; font-size: 44px; line-height: 1.15; }
.font-specimen-alphabet { font-size: 24px; line-height: 1.35; }
.font-specimen-sample { margin-top: 12px; }
.font-specimen-sample p { font-size: 22px; line-height: 1.35; }
.font-specimen-sample small, .font-preview-range small, .font-specimen-waterfall small { display: block; color: #6c757d; font-family: monospace; font-size: 11px; }
.font-specimen-note { margin-top: 8px !important; color: #6c757d; font-size: 13px; }
.font-preview-label { display: block; margin: 20px 0 8px; }
.font-preview-label span { display: block; margin-bottom: 4px; color: #6c757d; font-size: 12px; }
.font-specimen-waterfall p { display: flex; align-items: baseline; gap: 12px; padding: 2px 0; overflow: hidden; white-space: nowrap; }
.font-specimen-waterfall small { flex: 0 0 10em; text-align: right; white-space: nowrap; }
.font-specimen-waterfall span { line-height: 1.25; }
.font-specimen-waterfall .is-declared { border-radius: 4px; background: rgba(136, 98, 224, 0.08); }
.font-specimen-waterfall .is-declared small { color: #8862e0; }
.font-specimen-heading { margin: 20px 0 8px; color: #6c757d; font-size: 11px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; }
.font-preview-range { margin-bottom: 12px; }
.font-preview-range p { margin-top: 2px; line-height: 1.35; }
.font-preview-range span { display: inline-block; min-width: 0.7em; text-align: center; }
.font-preview-range span.is-missing { border-radius: 3px; background: rgba(210, 69, 60, 0.15); box-shadow: inset 0 0 0 1px #d2453c; color: #d2453c; }
</style>
