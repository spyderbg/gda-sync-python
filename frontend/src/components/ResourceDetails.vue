<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { baseName, directoryOf, extensionOf, number, plural, previewFrames, rssBadges, sequenceName, size, splitPath, time } from '../format';
import type { RssFileDetails, RssResource } from '../types';
import { busy, copy, openResourceFolder, requestResourceSync, resourceDetails, rssSync } from '../workspace';
import AppModal from './AppModal.vue';
import ReportThumbnail from './ReportThumbnail.vue';
import SequencePreview from './SequencePreview.vue';

// The details of one resource of the GDA sync report in a dialog, like the asset library's enlarged preview and asset
// details: a large preview, beside the GDA file's when the GDA has one, what the status means, the files' format, size,
// resolution, pixel format, mip levels and time, for the game and the GDA side by side, and where the resource is
// declared. An image sequence plays in the dialog, with how it plays, the totals of its files and each frame's status.
// Escape closes the dialog.
const props = defineProps<{ row: RssResource; revision: string }>();
const emit = defineEmits<{ close: [] }>();

const sequence = computed(() => props.row.sequence);
const name = computed(() => splitPath(props.row.resource).name);
const running = computed(() => !!rssSync.value?.running);
const unique = (paths: (string | null | undefined)[]) => [...new Set(paths.filter((path): path is string => !!path))];

// The files described: a sequence's game files and the GDA file of each of its frames, each once.
const gameFiles = computed(() => (sequence.value
  ? unique(sequence.value.frames.filter(frame => frame.category !== 'invalid').map(frame => frame.resourcePath))
  : props.row.category === 'invalid' ? [] : [props.row.resourcePath]));
const gdaFiles = computed(() => (sequence.value
  ? unique(sequence.value.frames.map(frame => frame.gdaFiles[0]?.absolutePath))
  : props.row.gdaFiles.slice(0, 1).map(file => file.absolutePath)));
const hasGda = computed(() => gdaFiles.value.length > 0);
const gdaLabel = computed(() => (sequence.value ? 'GDA frames' : props.row.category === 'different' ? 'GDA file, copied on sync' : 'Matching GDA file'));
// Computed once per row: SequencePreview loads its frames again whenever it gets other ones.
const gameFrames = computed(() => (sequence.value ? previewFrames(sequence.value, 'game') : []));
const gdaFrames = computed(() => (sequence.value ? previewFrames(sequence.value, 'gda') : []));
// The GDA preview shows beside the game's for a resource that the GDA has.
const pairedPreview = computed(() => hasGda.value && (props.row.category === 'different' || props.row.category === 'identical'));

const details = ref<Record<string, RssFileDetails>>({});
const loading = ref(false);
const loadError = ref('');
let request = 0;
watch(() => [props.row, props.revision], async () => {
  const id = ++request;
  const files = unique([...gameFiles.value, ...gdaFiles.value]).slice(0, 1000);
  details.value = {};
  loadError.value = '';
  if (!files.length) return;
  loading.value = true;
  try {
    const result = await resourceDetails(files);
    if (id === request) details.value = result;
  } catch (e) {
    if (id === request) loadError.value = (e as Error).message;
  } finally {
    if (id === request) loading.value = false;
  }
}, { immediate: true });

/** Up to three different values, then how many more there are. */
function listed(values: string[]) {
  const distinct = [...new Set(values)];
  return distinct.length > 3 ? `${distinct.slice(0, 3).join(', ')} +${distinct.length - 3} more` : distinct.join(', ');
}

/** What the table shows for a set of files: one file, or the totals of a sequence's files. */
function describe(files: string[]) {
  const found = files.map(file => details.value[file]).filter((entry): entry is RssFileDetails => !!entry && !entry.error);
  const dimensions = found.flatMap(entry => (entry.dimensions ? [entry.dimensions] : []));
  const none = loading.value ? '…' : '—';
  const newest = found.map(entry => entry.modifiedAt ?? '').sort().pop();
  return {
    format: listed(files.map(file => extensionOf(baseName(file)).toUpperCase()).filter(Boolean)) || none,
    files: files.length ? `${number(found.length)} of ${number(files.length)} found` : none,
    size: found.length ? size(found.reduce((total, entry) => total + (entry.size ?? 0), 0)) : none,
    resolution: listed(dimensions.map(item => `${item.width} × ${item.height}`)) || none,
    pixelFormat: listed(dimensions.map(item => item.format)) || none,
    mipmaps: listed(dimensions.flatMap(item => (item.mipmaps ? [String(item.mipmaps)] : []))) || none,
    modified: newest ? time(newest) : none,
  };
}

const table = computed(() => {
  const game = describe(gameFiles.value);
  const gda = describe(gdaFiles.value);
  const rows: { label: string; key: keyof typeof game; compare: boolean }[] = [
    { label: 'File format', key: 'format', compare: true },
    ...(sequence.value ? [{ label: 'Files', key: 'files' as const, compare: false }] : []),
    { label: sequence.value ? 'Total size' : 'File size', key: 'size', compare: true },
    { label: 'Resolution', key: 'resolution', compare: true },
    { label: 'Pixel format', key: 'pixelFormat', compare: true },
    { label: 'Mip levels', key: 'mipmaps', compare: true },
    { label: sequence.value ? 'Last modified, newest' : 'Last modified', key: 'modified', compare: false },
  ];
  return rows.map(({ label, key, compare }) => ({
    label, game: game[key], gda: gda[key],
    // A value that differs between the game and the GDA stands out.
    differs: hasGda.value && compare && game[key] !== gda[key] && ![game[key], gda[key]].some(value => value === '—' || value === '…'),
  }));
});

/** How the sequence plays, from its descriptor or as guessed. */
const animation = computed(() => {
  const current = sequence.value;
  if (!current) return [];
  const frames = current.frames.length;
  const files = new Set(current.frames.map(frame => frame.resourcePath)).size;
  const crops = listed(current.frames.flatMap(frame => (frame.source ? [`${frame.source.w} × ${frame.source.h} at ${frame.source.x}, ${frame.source.y}`] : [])));
  return [
    { label: 'Sequence', value: current.guessed ? 'Guessed from the file names' : sequenceName(current) },
    { label: 'Frames', value: `${number(frames)} frame${plural(frames)}${files !== frames ? `, ${number(files)} file${plural(files)}` : ''}` },
    { label: 'Frame time', value: `${current.frameTime} ms, ${current.frameTime > 0 ? Number((1000 / current.frameTime).toFixed(1)) : '—'} frames per second` },
    { label: 'Loops', value: current.loopCount === 0 ? 'Forever' : current.loopCount === 1 ? 'Once' : `${current.loopCount} times` },
    ...(current.loopTo ? [{ label: 'Later loops start at', value: `Frame ${current.loopTo}` }] : []),
    { label: 'One loop', value: `${(frames * current.frameTime / 1000).toFixed(2)} s` },
    ...(crops ? [{ label: 'Frame area', value: crops }] : []),
  ];
});
const frames = computed(() => (sequence.value?.frames ?? []).map((frame, index) => ({
  ...frame, index, name: splitPath(frame.resource).name, gda: frame.gdaFiles[0] ? splitPath(frame.gdaFiles[0].path).name : '',
})));
const showFrameStatus = computed(() => !sequence.value?.guessed);

const note = computed(() => {
  const many = !!sequence.value;
  switch (props.row.category) {
    case 'identical': return { icon: 'mdi-check-all', tone: 'is-synced', title: 'Everything looks good.', text: `The GDA folder has an identical ${many ? 'file for every frame' : 'file'}.` };
    case 'different': return {
      icon: 'mdi-sync', tone: 'is-pending', title: 'The GDA has another version.',
      text: many ? 'Sync copies the GDA file of each different frame over the game file, and keeps the replaced files in your backups.'
        : 'Sync copies the GDA file over the game file, and keeps the replaced file in your backups.',
    };
    case 'missing': return { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder.', text: `No GDA file has ${many ? 'the name of these files' : 'this name'}, so there is nothing to copy.` };
    case 'invalid': return { icon: 'mdi-alert-circle-outline', tone: 'is-invalid', title: 'The declared path cannot be used.', text: props.row.status.replace(/^invalid: /, '') };
    default: return {
      icon: 'mdi-file-question-outline', tone: 'is-supplementary', title: 'Not declared.',
      text: `No descriptor declares ${many ? 'these files' : 'this file'}, so the game does not load ${many ? 'them' : 'it'}, and ${many ? 'they are' : 'it is'} not compared with the GDA folder.${sequence.value?.guessed ? ' The sequence is guessed from the file names.' : ''}`,
    };
  }
});
const scope = computed(() => ({ game: '', common: 'A common resource, shared with other games.', outside: 'Outside the game folder.' })[props.row.scope]);
// Each folder of a sequence's GDA files, with one of its files to open it by.
const gdaFolders = computed(() => [...new Map(gdaFiles.value.map(file => [directoryOf(file), file])).entries()]
  .map(([folder, file]) => ({ folder, file })));
const syncable = computed(() => props.row.category === 'different' && props.row.gdaFiles.length > 0);

function sync() {
  emit('close');
  requestResourceSync([props.row]);
}
</script>

<template>
  <AppModal :title="name" xl @close="emit('close')">
    <div class="modal-body resource-details">
      <div :class="['details-previews', { 'is-paired': pairedPreview }]">
        <figure class="details-preview">
          <figcaption>{{ sequence ? 'Game frames' : 'Game file' }}<small v-if="sequence">Click to play again</small></figcaption>
          <SequencePreview v-if="sequence" :frames="gameFrames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="sequence.id ?? name" :revision="revision" />
          <ReportThumbnail v-else :file="row.resourcePath" :name="name" :revision="revision" :preview="row.category !== 'invalid'" />
        </figure>
        <figure v-if="pairedPreview" class="details-preview">
          <figcaption>{{ gdaLabel }}</figcaption>
          <SequencePreview v-if="sequence" :frames="gdaFrames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="`${sequence.id ?? name} from the GDA`" :revision="revision" />
          <ReportThumbnail v-else :file="row.gdaFiles[0].absolutePath" :name="baseName(row.gdaFiles[0].path)" :revision="revision" />
        </figure>
      </div>

      <div class="details-columns">
        <section class="details-summary" aria-label="Status">
          <span :class="['badge', 'details-status', rssBadges[row.category]]">{{ row.status }}</span>
          <h5 class="details-name" :title="row.resourcePath">{{ name }}</h5>
          <p class="details-folder text-muted"><i aria-hidden="true" class="mdi mdi-folder-outline" /> {{ splitPath(row.resource).folder }}</p>
          <div :class="['details-note', note.tone]">
            <i aria-hidden="true" :class="['mdi', note.icon]" />
            <p>{{ note.title }}<small>{{ note.text }}</small></p>
          </div>
          <p v-if="scope" class="details-scope text-muted"><i aria-hidden="true" class="mdi mdi-share-variant-outline" /> {{ scope }}</p>

          <h6 class="details-heading">Declared in</h6>
          <p v-if="!row.requiredBy.length" class="text-muted details-small">No JSON descriptor</p>
          <ul v-else class="details-list">
            <li v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="details-code">{{ use.descriptor }}:{{ use.line }}</li>
          </ul>

          <h6 class="details-heading">Game path</h6>
          <div class="details-path">
            <span class="details-code" :title="row.resourcePath">{{ row.resourcePath }}</span>
            <button type="button" class="details-icon" :aria-label="`Copy the game path ${row.resourcePath}`" title="Copy the game path" @click="copy(row.resourcePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
            <button type="button" class="details-icon" :aria-label="`Open the game folder of ${name}`" title="Open the game folder" @click="openResourceFolder(row.resourcePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
          </div>
          <template v-if="sequence && gdaFolders.length">
            <h6 class="details-heading">GDA folder{{ plural(gdaFolders.length) }}</h6>
            <div v-for="item in gdaFolders" :key="item.folder" class="details-path">
              <span class="details-code" :title="item.folder">{{ item.folder }}</span>
              <button type="button" class="details-icon" :aria-label="`Copy the GDA folder ${item.folder}`" title="Copy the GDA folder" @click="copy(item.folder)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
              <button type="button" class="details-icon" :aria-label="`Open the GDA folder ${item.folder}`" title="Open the GDA folder" @click="openResourceFolder(item.file)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
            </div>
          </template>
          <template v-else-if="row.gdaFiles.length">
            <h6 class="details-heading">GDA file{{ plural(row.gdaFiles.length) }}{{ row.gdaFiles.length > 1 ? ', closest folder first' : '' }}</h6>
            <div v-for="(file, index) in row.gdaFiles" :key="file.absolutePath" class="details-path">
              <span class="details-code" :title="file.absolutePath">{{ file.absolutePath }}</span>
              <span v-if="row.category === 'different'" :class="['badge', index ? 'badge-light' : 'badge-primary']">{{ index ? 'Other match' : 'Copied on sync' }}</span>
              <button type="button" class="details-icon" :aria-label="`Copy the GDA path ${file.path}`" title="Copy the GDA path" @click="copy(file.absolutePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
              <button type="button" class="details-icon" :aria-label="`Open the GDA folder of ${file.path}`" title="Open the GDA folder" @click="openResourceFolder(file.absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
            </div>
          </template>
        </section>

        <section class="details-facts" aria-label="File details">
          <h6 class="details-heading mt-0">{{ sequence ? 'Files' : 'File' }}</h6>
          <p v-if="loadError" class="text-danger details-small">{{ loadError }}</p>
          <table class="table details-table">
            <thead v-if="hasGda"><tr><th scope="col" /><th scope="col">Game</th><th scope="col">{{ gdaLabel }}</th></tr></thead>
            <tbody>
              <tr v-for="item in table" :key="item.label">
                <th scope="row">{{ item.label }}</th>
                <td :class="{ 'is-different': item.differs }">{{ item.game }}</td>
                <td v-if="hasGda" :class="{ 'is-different': item.differs }">{{ item.gda }}</td>
              </tr>
            </tbody>
          </table>

          <template v-if="sequence">
            <h6 class="details-heading">Animation</h6>
            <table class="table details-table">
              <tbody>
                <tr v-for="item in animation" :key="item.label"><th scope="row">{{ item.label }}</th><td>{{ item.value }}</td></tr>
                <tr v-for="(path, index) in sequence.paths" :key="path"><th scope="row">{{ index ? '' : `Path${plural(sequence.paths.length)}` }}</th><td class="details-code">{{ path }}</td></tr>
              </tbody>
            </table>

            <h6 class="details-heading">Frames</h6>
            <div class="details-frames">
              <table class="table table-sm">
                <thead><tr><th scope="col">#</th><th scope="col">Game file</th><th v-if="showFrameStatus" scope="col">Status</th><th v-if="hasGda" scope="col">GDA file</th></tr></thead>
                <tbody>
                  <tr v-for="frame in frames" :key="frame.index">
                    <td class="text-muted">{{ frame.index }}</td>
                    <td class="details-code" :title="frame.resourcePath">{{ frame.name }}</td>
                    <td v-if="showFrameStatus"><span :class="['badge', frame.category === 'skipped' ? 'badge-light' : rssBadges[frame.category]]">{{ frame.status }}</span></td>
                    <td v-if="hasGda" class="details-code" :title="frame.gdaFiles[0]?.absolutePath">{{ frame.gda || '—' }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </section>
      </div>
    </div>
    <div class="modal-footer details-footer">
      <span class="text-muted">{{ row.resource }}</span>
      <button type="button" class="btn btn-light" @click="emit('close')">Close</button>
      <button v-if="syncable" type="button" class="btn btn-primary" :disabled="!!busy || running" @click="sync">
        <i aria-hidden="true" class="mdi mdi-sync" />Sync this resource
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.resource-details { padding: 1.25rem 1.5rem; }
.details-previews { display: grid; gap: 16px; margin-bottom: 1.25rem; }
.details-previews.is-paired { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.details-preview { margin: 0; min-width: 0; }
.details-preview figcaption { display: flex; align-items: baseline; justify-content: space-between; gap: 8px; margin-bottom: 6px; color: #6c757d; font-size: 12px; }
.details-preview figcaption small { color: #97a098; }
.details-preview :deep(.thumbnail) { height: 42vh; min-height: 200px; border-radius: 4px; }
.details-preview :deep(.thumbnail img) { object-fit: contain; }
.details-columns { display: grid; grid-template-columns: minmax(0, 5fr) minmax(0, 7fr); gap: 28px; }
.details-status { max-width: 100%; white-space: normal; text-align: left; line-height: 1.3; }
.details-name { margin: 10px 0 4px; font-weight: 500; word-break: break-word; }
.details-folder { margin-bottom: 1rem; font-size: 0.8125rem; overflow-wrap: anywhere; }
.details-note { display: flex; align-items: flex-start; margin-bottom: 1rem; padding: 12px 14px; border-radius: 3px; background: rgba(255, 175, 0, 0.12); }
.details-note i { margin-right: 12px; color: #e69d00; font-size: 20px; line-height: 1; }
.details-note p { margin: 0; font-weight: 500; }
.details-note small { display: block; color: #6c757d; font-weight: 400; }
.details-note.is-synced { background: rgba(25, 216, 149, 0.12); }
.details-note.is-synced i { color: #13b57c; }
.details-note.is-invalid { background: rgba(37, 44, 70, 0.08); }
.details-note.is-invalid i { color: #252c46; }
.details-note.is-supplementary { background: rgba(136, 98, 224, 0.1); }
.details-note.is-supplementary i { color: #8862e0; }
.details-scope { font-size: 0.8125rem; }
.details-heading { margin: 1.25rem 0 0.5rem; color: #6c757d; font-size: 11px; font-weight: 500; letter-spacing: 0.8px; text-transform: uppercase; }
.details-small { margin: 0; font-size: 0.8125rem; }
.details-list { margin: 0; padding: 0; list-style: none; }
.details-code { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; }
.details-path { display: flex; align-items: center; gap: 4px; margin-bottom: 4px; }
.details-path > .details-code { flex: 1 1 auto; min-width: 0; }
.details-path .badge { flex-shrink: 0; }
.details-icon { display: flex; flex-shrink: 0; align-items: center; justify-content: center; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #6b7280; font-size: 15px; cursor: pointer; }
.details-icon:hover { background: #ebedf2; color: #4b49ac; }
.details-table { margin: 0; }
.details-table th, .details-table td { padding: 6px 8px 6px 0; border-top: 1px solid #f0f1f4; font-size: 0.8125rem; vertical-align: top; }
.details-table thead th { border-top: 0; color: #6c757d; font-size: 12px; font-weight: 500; }
.details-table tbody th { width: 34%; color: #6c757d; font-weight: 400; }
.details-table td { font-weight: 500; overflow-wrap: anywhere; }
.details-table td.is-different { color: #d2453c; }
.details-frames { max-height: 260px; overflow-y: auto; border: 1px solid #ebedf2; border-radius: 4px; }
.details-frames table { margin: 0; }
.details-frames th { position: sticky; top: 0; background: #fff; font-size: 12px; font-weight: 500; }
.details-frames td, .details-frames th { padding: 4px 10px; font-size: 12px; vertical-align: middle; }
.details-frames .badge { white-space: normal; text-align: left; }
.details-footer { gap: 8px; }
.details-footer > span { flex: 1 1 auto; min-width: 0; overflow: hidden; font-family: monospace; font-size: 12px; text-overflow: ellipsis; white-space: nowrap; }
@media (max-width: 991px) {
  .details-columns { grid-template-columns: minmax(0, 1fr); gap: 0; }
  .details-previews.is-paired { grid-template-columns: minmax(0, 1fr); }
  .details-preview :deep(.thumbnail) { height: 32vh; }
}
</style>
