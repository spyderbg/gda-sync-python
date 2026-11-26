<script setup lang="ts">
import {computed, onMounted, ref} from 'vue';
import {number, plural, splitPath} from '../format';
import type {MovieFormat, MovieOptions, RecreateMovieOptions, ReportAsset} from '../types';
import {busy, copy, createMovie, movieOptions, recreateMovie, recreateMovieOptions} from '../workspace';
import AppModal from './AppModal.vue';

// Make an image sequence into a movie, as the games' win animations were made by hand: its frames encoded by FFmpeg as
// H.264 at the chosen frame rate, in a file of the game folder, declared in RssMoviesData.json under a new RSS key.
// Opened for a movie, it only recreates the movie's file, from an image sequence or the movie's own frames: its path, RSS
// keys and declared format stay.
const props = defineProps<{ row: ReportAsset }>();
const emit = defineEmits<{ close: [] }>();

const FORMATS: Record<MovieFormat, string> = {
  valpha: 'valpha (alpha below)',
  'valpha-top': 'valpha-top (alpha above)',
  halpha: 'halpha (alpha on the right)',
  'halpha-left': 'halpha-left (alpha on the left)',
  opaque: 'Opaque (over black)',
};
const recreating = props.row.type === 'movie';
// Set for a sequence, and for a movie respectively.
const creation = ref<MovieOptions | null>(null);
const recreation = ref<RecreateMovieOptions | null>(null);
const options = computed(() => creation.value ?? recreation.value);
const sourceResolutions = computed(() => {
  const resolutions = creation.value?.variants.map(variant => variant.resolution ?? 'null') ?? [];
  return [...new Set(resolutions)].join(', ') || (creation.value?.resolution ?? 'null');
});
const source = ref('');
const reading = ref(false);
const loadError = ref('');
const key = ref('');
const path = ref('');
const format = ref<MovieFormat>('valpha');
const needsNativeSupport = computed(() => format.value === 'valpha-top' || format.value === 'halpha-left');
const fps = ref<number | string>('');
const crf = ref<number | null>(null);
const crfQuality = computed(() => {
  const value = crf.value;
  if (value === null) return '';
  if (value === 0) return 'Lossless after YUV 4:2:0 conversion, which can reduce color detail';
  if (value <= 18) return 'Nearly indistinguishable from the original';
  if (value <= 23) return 'Very good quality';
  if (value <= 30) return 'Visible compression';
  return 'Low quality.';
});
const gopSize = ref<number | string>('');
const descriptor = ref('');
const name = computed(() => props.row.sequence?.id ?? splitPath(props.row.resource).name);
const outputPath = computed(() => path.value.trim().replaceAll('\\', '/'));
const container = computed(() => outputPath.value.match(/\.(mov|mp4)$/i)?.[1].toLowerCase());
const validFps = computed(() => Number.isFinite(fps.value) && Number(fps.value) > 0);
// Omit the override when the displayed default is used so FFmpeg gets the exact sequence rate.
const fpsOverride = computed(() => !recreating && fps.value === options.value?.fps ? undefined : Number(fps.value));
const outputTiming = computed(() => {
  if (!validFps.value || !options.value) return null;
  const override = fpsOverride.value;
  const frameTime = override === undefined ? options.value.frameTime : 1000 / override;
  const duration = options.value.frames * (frameTime / 1000);
  if (!Number.isFinite(duration) || !Number.isFinite(frameTime) || frameTime <= 0) return null;
  return { frameTime: Number(frameTime.toFixed(3)), duration: Number(duration.toFixed(3)) };
});
const gopArgument = computed(() => {
  const value = gopSize.value;
  if (options.value && typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= options.value.maxGopSize) {
    return value;
  }
});
const keyframeInterval = computed(() => {
  const current = options.value;
  const frames = gopArgument.value;
  if (!current || frames === undefined) return '';
  if (frames <= 1) return 'I-frame every frame';
  if (frames === current.maxGopSize) return 'No maximum I-frame interval';
  if (!validFps.value) return '';
  const rate = fpsOverride.value ?? 1000 / current.frameTime;
  const seconds = Number((frames / rate).toPrecision(4));
  return Number.isFinite(seconds) ? `I-frame every ${seconds} second${plural(seconds)} or sooner` : '';
});

async function loadRecreation(chosen?: string) {
  reading.value = true;
  loadError.value = '';
  try {
    const first = !recreation.value;
    const result = await recreateMovieOptions(props.row.id, chosen);
    recreation.value = result;
    source.value = result.source;
    path.value = result.path;
    if (!result.formats.includes(format.value) || first) format.value = result.movieFormat;
    if (first) {
      fps.value = result.fps > 0 ? result.fps : '';
      crf.value = result.crf;
      gopSize.value = result.gopSize;
    }
  } catch (e) {
    loadError.value = (e as Error).message;
    // The options still shown are the previous source's.
    if (recreation.value) source.value = recreation.value.source;
  } finally { reading.value = false; }
}

onMounted(async () => {
  if (recreating) return loadRecreation();
  try {
    const result = await movieOptions(props.row.id);
    creation.value = result;
    key.value = result.id;
    path.value = result.path;
    format.value = result.movieFormat;
    fps.value = result.fps > 0 ? result.fps : '';
    crf.value = result.crf;
    gopSize.value = result.gopSize;
    descriptor.value = result.descriptors[0] ?? '';
  } catch (e) {
    loadError.value = (e as Error).message;
  }
});

// Switching the format keeps the path's -rgba suffix in step with it.
function chooseFormat(value: MovieFormat) {
  if (recreating) {
    format.value = value;
    return;
  }
  if (value !== 'opaque' && !/-rgba\.(mov|mp4)$/i.test(path.value)) path.value = path.value.replace(/\.(mov|mp4)$/i, '-rgba.$1');
  if (value === 'opaque') path.value = path.value.replace(/-rgba\.(mov|mp4)$/i, '.$1');
  format.value = value;
}

const problems = computed(() => {
  const result: string[] = [];
  if (!options.value) return result;
  if (creation.value) {
    const id = key.value.trim();
    if (!id) result.push('The movie needs an RSS key.');
    else if (!/^[A-Za-z0-9_.-]+$/.test(id)) result.push('An RSS key is letters, digits, underscores, dots and hyphens.');
    else if (creation.value.ids.includes(id)) result.push(`${id} is the key of another resource of the game.`);
  }
  if (!container.value) result.push('The path is a .mov or .mp4 file in the game folder.');
  if (!validFps.value) result.push('Enter a frame rate greater than zero.');
  if (gopArgument.value === undefined) result.push(`Enter a whole keyframe interval from 0 to ${number(options.value.maxGopSize)} frames.`);
  if (creation.value && !descriptor.value) result.push('The game has no RssMoviesData.json to declare the movie in.');
  return result;
});
// One Movie entry for each ImageSequence entry of the sequence's id with its frames, with its resolution and language.
const entries = computed(() => {
  const movieFormat = format.value === 'opaque' ? {} : {movieFormat: format.value};
  return (creation.value?.variants ?? [{}]).map(variant => ({id: key.value.trim(), path: outputPath.value, ...movieFormat, ...variant}));
});
const variantsLabel = computed(() => (creation.value?.variants.length ?? 0) > 1
  ? `${creation.value!.variants.map(variant => [variant.language, variant.resolution].filter(Boolean).join(' ')).join(', ')}` : '');
const entry = computed(() => JSON.stringify(entries.value.length > 1 ? entries.value : entries.value[0] ?? {}, null, 4));

const ffmpegCommand = computed(() => {
  const current = options.value;
  if (!current) return '';
  const output = outputPath.value;
  const quotedOutput = /^[\w./-]+$/.test(output) ? output : "'" + output.replaceAll("'", "'\\''") + "'";
  const replacements: Record<string, string> = {
    '{size}': current.ffmpeg.sizes[format.value],
    '{rate}': validFps.value ? String(fpsOverride.value ?? ('1000/' + current.frameTime)) : '{rate}',
    '{crf}': String(crf.value ?? current.crf),
    '{gopSize}': String(gopArgument.value ?? '{gopSize}'),
    '{container}': container.value ?? '{container}',
    '{output}': output ? quotedOutput : '{output}',
  };
  const lines = current.ffmpeg.arguments.map(group => group.map(argument => replacements[argument] ?? argument).join(' '));
  return 'ffmpeg ' + lines.join(' \\\n  ');
});

async function create() {
  if (!options.value || crf.value === null || gopArgument.value === undefined || problems.value.length || busy.value || reading.value) return;
  if (recreation.value) {
    const body = {
      asset: props.row.id, source: recreation.value.source, movieFormat: format.value, fps: Number(fps.value), crf: crf.value, gopSize: gopArgument.value
    };
    if (await recreateMovie(body, recreation.value.path)) emit('close');
    return;
  }
  const body = {
    asset: props.row.id, id: key.value.trim(), path: outputPath.value, descriptor: descriptor.value,
    movieFormat: format.value, fps: fpsOverride.value, crf: crf.value, gopSize: gopArgument.value
  };
  if (await createMovie(body, {id: options.value.sequenceId, loopCount: options.value.loopCount})) emit('close');
}
</script>

<template>
  <AppModal :title="recreating ? `Recreate ${name}` : `Make a movie of ${name}`" stacked dialog-class="movie-dialog modal-dialog-scrollable"
            @close="busy !== 'movie' && emit('close')">
    <form class="modal-body movie-body" @submit.prevent="create">
      <p v-if="loadError" class="text-danger" :class="{'mb-0': !options}" role="alert">{{ loadError }}</p>
      <p v-if="!options && !loadError" class="text-muted mb-0"><i aria-hidden="true" class="mdi mdi-loading mdi-spin"/> Reading
        the frames…</p>
      <template v-if="options">
        <dl v-if="recreation" class="movie-facts" aria-label="Current movie parameters">
          <div>
            <dt class="text-muted">current size</dt>
            <dd>{{ recreation.current.width }} × {{ recreation.current.height }}</dd>
          </div>
          <div>
            <dt class="text-muted">frames</dt>
            <dd>{{ number(recreation.current.frames) }}</dd>
          </div>
          <div>
            <dt class="text-muted">FPS</dt>
            <dd>{{ recreation.current.fps }}</dd>
          </div>
          <div>
            <dt class="text-muted">language</dt>
            <dd>{{ recreation.languages.map(value => value ?? 'null').join(', ') || 'null' }}</dd>
          </div>
          <div>
            <dt class="text-muted">resolution</dt>
            <dd>{{ recreation.resolutions.map(value => value ?? 'null').join(', ') || 'null' }}</dd>
          </div>
        </dl>
        <dl v-else class="movie-facts" aria-label="Source sequence parameters">
          <div>
            <dt class="text-muted">frameTime</dt>
            <dd>{{ options.frameTime }}</dd>
          </div>
          <div>
            <dt class="text-muted">loopCount</dt>
            <dd>{{ options.loopCount }}</dd>
          </div>
          <div>
            <dt class="text-muted">loopTo</dt>
            <dd>{{ options.loopTo ?? 'null' }}</dd>
          </div>
          <div>
            <dt class="text-muted">language</dt>
            <dd>{{ creation?.language ?? 'null' }}</dd>
          </div>
          <div>
            <dt class="text-muted">resolution</dt>
            <dd>{{ sourceResolutions }}</dd>
          </div>
        </dl>
        <div v-if="recreation" class="movie-field">
          <label class="movie-label" for="movie-source">Source</label>
          <select id="movie-source" v-model="source" class="form-control form-control-sm" :disabled="reading || !!busy"
                  :aria-describedby="recreation.source === row.id ? 'movie-source-note' : undefined"
                  @change="loadRecreation(source)">
            <option v-for="item in recreation.sources" :key="item.asset" :value="item.asset" :title="item.resource">
              {{ item.name }} ({{ number(item.frames) }} frame{{ plural(item.frames) }})
            </option>
            <option :value="row.id">This movie's own frames</option>
          </select>
          <small v-if="recreation.source === row.id" id="movie-source-note" class="movie-field-note text-muted">Encoding
            a movie again loses some quality. Choose its image sequence when it has one.</small>
        </div>
        <div v-if="!recreating" class="movie-field">
          <label class="movie-label" for="movie-key">RSS key</label>
          <input id="movie-key" v-model="key" class="form-control form-control-sm movie-code" required maxlength="200"
                 spellcheck="false" autocomplete="off">
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-path">Path</label>
          <input id="movie-path" v-model="path" class="form-control form-control-sm movie-code" required
                 :readonly="recreating" maxlength="1000" spellcheck="false" autocomplete="off"
                 :aria-describedby="variantsLabel ? 'movie-path-variants' : undefined">
          <small v-if="variantsLabel" id="movie-path-variants" class="movie-field-note movie-variants text-muted">Declared
            for {{ variantsLabel }}</small>
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-fps">Frames per second</label>
          <input id="movie-fps" v-model="fps" type="number" step="any" class="form-control form-control-sm" required
                 :aria-describedby="outputTiming ? 'movie-output-frame-time' : undefined">
          <small v-if="outputTiming" id="movie-output-frame-time" class="movie-field-note text-muted">Output frame time
            {{ outputTiming.frameTime }} ms · output duration {{ outputTiming.duration }} s</small>
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-gop-size">Keyframe interval</label>
          <input id="movie-gop-size" v-model="gopSize" type="number" min="0" :max="options.maxGopSize" step="1"
                 class="form-control form-control-sm" required
                 :aria-describedby="keyframeInterval ? 'movie-gop-hint' : undefined">
          <small v-if="keyframeInterval" id="movie-gop-hint" class="movie-field-note text-muted">{{
              keyframeInterval
            }}</small>
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-crf">CRF</label>
          <select id="movie-crf" v-model="crf" class="form-control form-control-sm"
                  aria-describedby="movie-crf-quality">
            <option v-for="value in options.crfValues" :key="value" :value="value">{{
                value
              }}{{ value === options.crf ? ' (default)' : '' }}
            </option>
          </select>
          <small id="movie-crf-quality" class="movie-field-note text-muted" aria-live="polite">{{ crfQuality }}</small>
        </div>
        <div class="movie-field">
          <label class="movie-label" for="movie-format">Format</label>
          <select id="movie-format" class="form-control form-control-sm" :value="format" :disabled="options.formats.length === 1"
                  :aria-describedby="needsNativeSupport ? 'movie-alpha-note' : undefined"
                  @change="chooseFormat(($event.target as HTMLSelectElement).value as MovieFormat)">
            <option v-for="item in options.formats" :key="item" :value="item">{{ FORMATS[item] }}</option>
          </select>
          <small v-if="needsNativeSupport" id="movie-alpha-note" class="movie-field-note text-muted">Plays with alpha in
            GDA Sync. Native playback requires renderer support for this layout.</small>
        </div>
        <div v-if="creation && creation.descriptors.length > 1" class="movie-field">
          <label class="movie-label" for="movie-descriptor">Descriptor</label>
          <select id="movie-descriptor" v-model="descriptor" class="form-control form-control-sm">
            <option v-for="item in creation.descriptors" :key="item" :value="item">{{ item }}</option>
          </select>
        </div>
        <section v-if="!recreating" aria-labelledby="movie-entry-heading">
          <div class="movie-preview-heading">
            <h6 id="movie-entry-heading" class="movie-heading">{{ descriptor || 'RssMoviesData.json' }} · movies<template
                v-if="entries.length > 1"> · {{ entries.length }} entries</template></h6>
            <button type="button" class="details-icon" aria-label="Copy movie entry JSON" title="Copy movie entry JSON"
                    @click="copy(entry, 'Movie entry copied to clipboard.')">
              <i aria-hidden="true" class="mdi mdi-content-copy"/>
            </button>
          </div>
          <pre class="movie-preview">{{ entry }}</pre>
        </section>
        <section aria-labelledby="movie-ffmpeg-heading">
          <div class="movie-preview-heading">
            <h6 id="movie-ffmpeg-heading" class="movie-heading">FFmpeg Command</h6>
            <button type="button" class="details-icon" aria-label="Copy FFmpeg command" title="Copy FFmpeg command"
                    @click="copy(ffmpegCommand, 'FFmpeg command copied to clipboard.')">
              <i aria-hidden="true" class="mdi mdi-content-copy"/>
            </button>
          </div>
          <pre class="movie-preview movie-command-preview" tabindex="0"
               aria-labelledby="movie-ffmpeg-heading">{{ ffmpegCommand }}</pre>
        </section>
        <ul v-if="problems.length" class="movie-problems text-danger">
          <li v-for="problem in problems" :key="problem">{{ problem }}</li>
        </ul>
      </template>
      <button type="submit" hidden/>
    </form>
    <div class="modal-footer movie-footer">
      <span v-if="recreating" class="text-muted">Only the movie's file is replaced: its path, RSS keys and format stay. Its previous version is saved in your backups.</span>
      <span v-else class="text-muted">The sequence stays. The descriptor's previous version is saved in your backups, and undoing removes the movie.</span>
      <button type="button" class="btn btn-primary btn-sm" :disabled="!options || !!problems.length || !!busy || reading"
              @click="create">
        <i v-if="busy === 'movie'" aria-hidden="true"
           class="mdi mdi-loading mdi-spin"/>{{ busy === 'movie' ? 'Encoding…' : 'Make movie' }}
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.movie-body {
  padding: 14px 16px;
}

.movie-facts {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 4px 16px;
  margin: 0 0 12px;
  padding: 0;
  font-size: 0.8125rem;
}

.movie-facts > div {
  display: flex;
  gap: 6px;
}

.movie-facts dt {
  font-weight: 400;
}

.movie-facts dd {
  margin: 0;
}

.movie-field {
  display: grid;
  grid-template-columns: 96px minmax(0, 1fr);
  align-items: center;
  gap: 4px 6px;
  margin-bottom: 6px;
}

.movie-label {
  margin: 0;
  color: #4a4a4a;
  font-size: 0.8125rem;
}

.movie-field:has(> .movie-field-note) > .movie-label {
  grid-area: 1 / 1 / span 2;
  align-self: start;
  margin-top: 4px;
}

.movie-field-note {
  grid-column: 2;
  text-transform: lowercase;
}

.movie-variants {
  text-transform: none;
}

.movie-code {
  font-family: monospace;
}

.movie-heading {
  margin: 0;
  font-size: 0.75rem;
  color: #6c757d;
}

.movie-preview {
  margin: 0;
  padding: 8px 10px;
  border-radius: 6px;
  background: #f6f8fa;
  font-size: 12px;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

.movie-preview-heading {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 10px;
}

.movie-command-preview {
  white-space: pre;
  overflow-x: auto;
}

.movie-problems {
  margin: 8px 0 0;
  padding-left: 18px;
  font-size: 0.8125rem;
}

.movie-footer {
  gap: 8px;
}

.movie-footer > span {
  flex: 1;
  font-size: 0.75rem;
}
</style>
