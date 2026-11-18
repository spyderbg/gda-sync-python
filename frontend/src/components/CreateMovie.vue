<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { number, plural, splitPath } from '../format';
import type { MovieFormat, MovieOptions, ReportAsset } from '../types';
import { busy, createMovie, movieOptions } from '../workspace';
import AppModal from './AppModal.vue';

// Make an image sequence into a movie, as the games' win animations were made by hand: its frames encoded by FFmpeg as
// H.264 at the sequence's frame rate, in a file of the game folder, declared in RssMoviesData.json under a new RSS key.
// An Anim element can then name that key instead of the sequence's; the sequence and its frames stay until nothing uses
// them. A valpha movie stacks the frames' alpha under their picture, as the games' transparent movies do.
const props = defineProps<{ row: ReportAsset }>();
const emit = defineEmits<{ close: [] }>();

const FORMATS: Record<MovieFormat, string> = {
  valpha: 'valpha: transparent, its alpha stacked under its picture',
  opaque: 'opaque: no alpha, over black',
};
const options = ref<MovieOptions | null>(null);
const loadError = ref('');
const key = ref('');
const path = ref('');
const format = ref<MovieFormat>('valpha');
const descriptor = ref('');
const name = computed(() => props.row.sequence?.id ?? splitPath(props.row.resource).name);

onMounted(async () => {
  try {
    const result = await movieOptions(props.row.id);
    options.value = result;
    key.value = result.id;
    path.value = result.path;
    format.value = result.movieFormat;
    descriptor.value = result.descriptors[0] ?? '';
  } catch (e) {
    loadError.value = (e as Error).message;
  }
});

// Switching the format keeps the path's -rgba suffix in step with it.
function chooseFormat(value: MovieFormat) {
  if (value === 'valpha' && !/-rgba\.(mov|mp4)$/i.test(path.value)) path.value = path.value.replace(/\.(mov|mp4)$/i, '-rgba.$1');
  if (value === 'opaque') path.value = path.value.replace(/-rgba\.(mov|mp4)$/i, '.$1');
  format.value = value;
}

const problems = computed(() => {
  const result: string[] = [];
  if (!options.value) return result;
  const id = key.value.trim();
  if (!id) result.push('The movie needs an RSS key.');
  else if (!/^[A-Za-z0-9_.-]+$/.test(id)) result.push('An RSS key is letters, digits, underscores, dots and hyphens.');
  else if (options.value.ids.includes(id)) result.push(`${id} is the key of another resource of the game.`);
  if (!/\.(mov|mp4)$/i.test(path.value.trim())) result.push('The path is a .mov or .mp4 file in the game folder.');
  if (!descriptor.value) result.push('The game has no RssMoviesData.json to declare the movie in.');
  return result;
});
const entry = computed(() => JSON.stringify({ id: key.value.trim(), path: path.value.trim(), ...(format.value === 'opaque' ? {} : { movieFormat: format.value }) }, null, 4));

async function create() {
  if (!options.value || problems.value.length || busy.value) return;
  const body = { asset: props.row.id, id: key.value.trim(), path: path.value.trim(), descriptor: descriptor.value, movieFormat: format.value };
  if (await createMovie(body, { id: options.value.sequenceId, loopCount: options.value.loopCount })) emit('close');
}
</script>

<template>
  <AppModal :title="`Make a movie of ${name}`" stacked dialog-class="movie-dialog" @close="busy !== 'movie' && emit('close')">
    <form class="modal-body movie-body" @submit.prevent="create">
      <p v-if="loadError" class="text-danger mb-0" role="alert">{{ loadError }}</p>
      <p v-else-if="!options" class="text-muted mb-0"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Reading the frames…</p>
      <template v-else>
        <p class="movie-facts text-muted">
          {{ number(options.frames) }} frame{{ plural(options.frames) }} every {{ options.frameTime }} ms: {{ options.fps }} frames a second.
          {{ options.loopCount === 0 ? 'The sequence loops forever' : `The sequence plays ${options.loopCount} time${plural(options.loopCount)}` }};
          a movie plays once unless its Anim element sets <code>loopCount</code>.
        </p>
        <div class="movie-field">
          <label class="movie-label" for="movie-key">RSS key</label>
          <input id="movie-key" v-model="key" class="form-control form-control-sm movie-code" required maxlength="200" spellcheck="false" autocomplete="off">
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-path">Path</label>
          <input id="movie-path" v-model="path" class="form-control form-control-sm movie-code" required maxlength="1000" spellcheck="false" autocomplete="off">
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-format">Format</label>
          <select id="movie-format" class="form-control form-control-sm" :value="format" @change="chooseFormat(($event.target as HTMLSelectElement).value as MovieFormat)">
            <option v-for="item in options.formats" :key="item" :value="item">{{ FORMATS[item] }}</option>
          </select>
        </div>
        <div v-if="options.descriptors.length > 1" class="movie-field">
          <label class="movie-label" for="movie-descriptor">Descriptor</label>
          <select id="movie-descriptor" v-model="descriptor" class="form-control form-control-sm">
            <option v-for="item in options.descriptors" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <h6 class="movie-heading">{{ descriptor || 'RssMoviesData.json' }} · movies</h6>
        <pre class="movie-preview">{{ entry }}</pre>
        <ul v-if="problems.length" class="movie-problems text-danger">
          <li v-for="problem in problems" :key="problem">{{ problem }}</li>
        </ul>
      </template>
      <button type="submit" hidden />
    </form>
    <div class="modal-footer movie-footer">
      <span class="text-muted">The sequence stays. The descriptor's previous version is saved in your backups, and undoing removes the movie.</span>
      <button type="button" class="btn btn-light btn-sm" :disabled="busy === 'movie'" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!options || !!problems.length || !!busy" @click="create">
        <i v-if="busy === 'movie'" aria-hidden="true" class="mdi mdi-loading mdi-spin" />{{ busy === 'movie' ? 'Encoding…' : 'Make movie' }}
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.movie-body { padding: 14px 16px; }
.movie-facts { font-size: 0.8125rem; margin-bottom: 12px; }
.movie-field { display: grid; grid-template-columns: 96px minmax(0, 1fr); align-items: center; column-gap: 6px; margin-bottom: 6px; }
.movie-label { margin: 0; color: #4a4a4a; font-size: 0.8125rem; }
.movie-code { font-family: monospace; }
.movie-heading { margin: 14px 0 6px; font-size: 0.75rem; color: #6c757d; }
.movie-preview { margin: 0; padding: 8px 10px; border-radius: 6px; background: #f6f8fa; font-size: 12px; white-space: pre-wrap; overflow-wrap: anywhere; }
.movie-problems { margin: 8px 0 0; padding-left: 18px; font-size: 0.8125rem; }
.movie-footer { gap: 8px; }
.movie-footer > span { flex: 1; font-size: 0.75rem; }
</style>
