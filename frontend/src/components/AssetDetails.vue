<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { assetBadges, assetFrames, baseName, codePoint, extensionOf, fileType, firstRtfPage, number, plural, sequenceName, size, splitPath, time, typeIcons, viewTable } from '../format';
import type { FileFacts, ReportAsset } from '../types';
import { copy, openDeclaration, openResourceFolder } from '../workspace';
import AppModal from './AppModal.vue';
import AudioPreview from './AudioPreview.vue';
import FontPreview from './FontPreview.vue';
import ReportThumbnail from './ReportThumbnail.vue';
import RtfPreview from './RtfPreview.vue';
import SequencePreview from './SequencePreview.vue';
import ViewPreview from './ViewPreview.vue';

// The details of one asset of the asset report in a dialog, like the details of a GDA sync report resource: a large
// preview, what the status means, the descriptor entries that load the asset, its game path with buttons to copy it or
// open its folder, and the format, size, resolution, pixel format, mip levels and time of its file. An image sequence
// plays in the dialog, with how it plays, the totals of its files and each frame's status. An audio file plays once
// when the dialog opens. A font is drawn with itself, with the characters and at the size of the Font entry chosen, its
// names and glyph count, and for each Font entry, which of its declared characters the font has. An RTF is its folder,
// named by it: it draws its pages, in each of its languages, with its tool version, its pages, each of which the table
// shows on the preview, the images and videos its pages draw that are missing, and every file of the folder; its folder
// button opens the RTF's folder itself. Escape closes the dialog.
const props = defineProps<{ row: ReportAsset; revision: string }>();
const emit = defineEmits<{ close: [] }>();

const sequence = computed(() => props.row.sequence);
const name = computed(() => splitPath(props.row.resource).name);
const readable = computed(() => props.row.category === 'available' || props.row.category === 'supplementary');
const isAudio = computed(() => fileType(extensionOf(baseName(props.row.resourcePath))) === 'audio');
const frames = computed(() => (sequence.value ? assetFrames(sequence.value) : []));
// The Font entries that declare characters of a font, and the one whose characters the preview draws.
const isFont = computed(() => props.row.type === 'font');
const fontUses = computed(() => props.row.requiredBy.filter(use => use.chars));
const chosen = ref(0);
watch(() => props.row.id, () => { chosen.value = 0; });
const fontUse = computed(() => fontUses.value[chosen.value] ?? null);
// An RTF's facts, its folder, its .rtf file, which the previews show, and the page its preview shows.
const rtf = computed(() => (readable.value ? props.row.rtf : undefined));
const directory = computed(() => props.row.directory);
const file = computed(() => directory.value?.project ?? props.row.resourcePath);
const rtfPage = ref(0);
// A view's facts: what its elements draw.
const view = computed(() => (readable.value ? props.row.view : undefined));
watch(() => props.row.id, () => { rtfPage.value = props.row.rtf ? firstRtfPage(props.row.rtf) : 0; }, { immediate: true });

/** Up to three different values, then how many more there are. */
function listed(values: string[]) {
  const distinct = [...new Set(values)];
  return distinct.length > 3 ? `${distinct.slice(0, 3).join(', ')} +${distinct.length - 3} more` : distinct.join(', ');
}

const table = computed(() => {
  const current = sequence.value;
  // A sequence's files, each once: an atlas repeats one file in many frames.
  const files: (FileFacts & { resourcePath: string })[] = current
    ? [...new Map(current.frames.map(frame => [frame.resourcePath, frame])).values()]
    : [props.row];
  const found = files.filter(file => file.size !== undefined);
  const dimensions = found.flatMap(file => (file.dimensions ? [file.dimensions] : []));
  const newest = found.map(file => file.modifiedAt ?? '').sort().pop();
  const font = props.row.font;
  if (props.row.type === 'rtf') {
    const facts = rtf.value;
    const folder = directory.value;
    return [
      { label: folder ? 'Project file' : 'File format', value: [folder ? baseName(folder.project) : '', facts ? 'RTF Tool project (JSON)' : ''].filter(Boolean).join(', ') || 'RTF' },
      ...(facts ? [
        { label: 'Tool version', value: facts.version ?? '—' },
        { label: 'Languages', value: facts.languages.join(', ') || '—' },
        { label: 'Pages', value: `${number(facts.pages.length)}${facts.pages.length ? `, ${listed(facts.pages.map(page => `${page.width} × ${page.height}`))}` : ''}` },
        { label: 'Images and videos', value: `${number(facts.images)} image${plural(facts.images)}, ${number(facts.videos)} video${plural(facts.videos)}` },
        { label: 'Missing files', value: facts.missingCount ? number(facts.missingCount) : 'None', warn: !!facts.missingCount },
        { label: 'Texts and styles', value: `${number(facts.texts)} text${plural(facts.texts)}, ${number(facts.styles)} style${plural(facts.styles)}` },
      ] : [{ label: 'RTF', value: props.row.rtfError ?? (readable.value ? 'Rescan to read its pages' : '—') }]),
      ...(folder ? [{ label: 'Files', value: `${number(folder.files.length)} file${plural(folder.files.length)}` }] : []),
      { label: folder ? 'Total size' : 'File size', value: props.row.size !== undefined ? size(props.row.size) : '—' },
      { label: folder ? 'Last modified, newest' : 'Last modified', value: props.row.modifiedAt ? time(props.row.modifiedAt) : '—' },
    ];
  }
  if (props.row.type === 'view') {
    return [
      ...(view.value ? viewTable(view.value) : [{ label: 'View', value: props.row.viewError ?? (readable.value ? 'Rescan to read its elements' : '—') }]),
      { label: 'File size', value: props.row.size !== undefined ? size(props.row.size) : '—' },
      { label: 'Last modified', value: props.row.modifiedAt ? time(props.row.modifiedAt) : '—' },
    ];
  }
  if (isFont.value) {
    return [
      { label: 'File format', value: font?.format ?? (extensionOf(name.value).toUpperCase() || '—') },
      ...(font ? [
        { label: 'Family', value: font.family ?? '—' }, { label: 'Style', value: font.style ?? '—' },
        { label: 'Version', value: font.version ?? '—' }, { label: 'Glyphs', value: font.glyphs !== undefined ? number(font.glyphs) : '—' },
      ] : [{ label: 'Font', value: props.row.fontError ?? '—' }]),
      { label: 'File size', value: props.row.size !== undefined ? size(props.row.size) : '—' },
      { label: 'Last modified', value: props.row.modifiedAt ? time(props.row.modifiedAt) : '—' },
    ];
  }
  return [
    { label: 'File format', value: listed(files.map(file => extensionOf(baseName(file.resourcePath)).toUpperCase()).filter(Boolean)) || '—' },
    ...(current ? [{ label: 'Files', value: `${number(found.length)} of ${number(files.length)} found` }] : []),
    { label: current ? 'Total size' : 'File size', value: found.length ? size(found.reduce((total, file) => total + (file.size ?? 0), 0)) : '—' },
    { label: 'Resolution', value: listed(dimensions.map(item => `${item.width} × ${item.height}`)) || '—' },
    { label: 'Pixel format', value: listed(dimensions.map(item => item.format)) || '—' },
    { label: 'Mip levels', value: listed(dimensions.flatMap(item => (item.mipmaps ? [String(item.mipmaps)] : []))) || '—' },
    { label: current ? 'Last modified, newest' : 'Last modified', value: newest ? time(newest) : '—' },
  ];
});

/** How the sequence plays, from its descriptor or as guessed. */
const animation = computed(() => {
  const current = sequence.value;
  if (!current) return [];
  const count = current.frames.length;
  const files = new Set(current.frames.map(frame => frame.resourcePath)).size;
  const crops = listed(current.frames.flatMap(frame => (frame.source ? [`${frame.source.w} × ${frame.source.h} at ${frame.source.x}, ${frame.source.y}`] : [])));
  return [
    { label: 'Sequence', value: current.guessed ? 'Guessed from the file names' : sequenceName(current) },
    { label: 'Frames', value: `${number(count)} frame${plural(count)}${files !== count ? `, ${number(files)} file${plural(files)}` : ''}` },
    { label: 'Frame time', value: `${current.frameTime} ms, ${current.frameTime > 0 ? Number((1000 / current.frameTime).toFixed(1)) : '—'} frames per second` },
    { label: 'Loops', value: current.loopCount === 0 ? 'Forever' : current.loopCount === 1 ? 'Once' : `${current.loopCount} times` },
    ...(current.loopTo ? [{ label: 'Later loops start at', value: `Frame ${current.loopTo}` }] : []),
    { label: 'One loop', value: `${(count * current.frameTime / 1000).toFixed(2)} s` },
    ...(crops ? [{ label: 'Frame area', value: crops }] : []),
  ];
});
const frameRows = computed(() => (sequence.value?.frames ?? []).map((frame, index) => ({ ...frame, index, name: splitPath(frame.resource).name })));

const note = computed(() => {
  const many = !!sequence.value;
  // An RTF is loaded by its .rtf file.
  const project = directory.value ? `its project file, ${baseName(directory.value.project)}` : '';
  switch (props.row.category) {
    case 'available': return {
      icon: 'mdi-check-all', tone: 'is-synced', title: 'Loaded by the game.',
      text: `The descriptor entries below load ${project || (many ? 'these files' : 'this file')}, and ${many ? 'every one exists' : 'it exists'} in the game.`,
    };
    case 'missing': return {
      icon: 'mdi-file-alert-outline', tone: 'is-pending', title: 'Not in the game folder.',
      text: many ? 'A descriptor declares frames whose files do not exist, so the game cannot load them.' : `A descriptor declares ${project || 'this file'}, but it does not exist, so the game cannot load it.`,
    };
    case 'invalid': return { icon: 'mdi-alert-circle-outline', tone: 'is-invalid', title: 'The declared path cannot be used.', text: props.row.status.replace(/^invalid: /, '') };
    default: return {
      icon: 'mdi-file-question-outline', tone: 'is-supplementary', title: 'Not declared.',
      text: `No descriptor declares ${project || (many ? 'these files' : 'this file')}, so the game does not load ${many ? 'them' : 'it'}.${sequence.value?.guessed ? ' The sequence is guessed from the file names.' : ''}`,
    };
  }
});
const scope = computed(() => ({ game: '', common: 'A common resource, shared with other games.', outside: 'Outside the game folder.' })[props.row.scope]);
</script>

<template>
  <AppModal :title="name" xl @close="emit('close')">
    <div class="modal-body details-dialog asset-details">
      <div class="details-previews">
        <figure class="details-preview">
          <figcaption>
            {{ sequence ? 'Game frames' : rtf ? 'Pages' : view ? 'View, as the game draws it' : 'Game file' }}<small v-if="sequence">Click to play again</small>
            <span v-if="isFont && fontUses.length > 1" class="btn-group btn-group-sm" role="group" aria-label="Characters of the Font entry">
              <button v-for="(use, index) in fontUses" :key="`${use.descriptor}:${use.line}`" type="button" :class="['btn', 'btn-secondary', { active: index === chosen }]" :aria-pressed="index === chosen" @click="chosen = index">{{ use.id ?? `${use.descriptor}:${use.line}` }}</button>
            </span>
          </figcaption>
          <SequencePreview v-if="sequence" :frames="frames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="sequence.id ?? name" :revision="revision" />
          <AudioPreview v-else-if="isAudio && readable" :file="row.resourcePath" :name="name" :revision="revision" autoplay />
          <FontPreview v-else-if="isFont && readable" :file="row.resourcePath" :name="name" :revision="revision" large
                       :chars="fontUse?.chars" :size="fontUse?.size" :missing="fontUse?.coverage?.missing" />
          <RtfPreview v-else-if="rtf" v-model:page="rtfPage" :file="file" :name="name" :revision="revision" :facts="rtf" large />
          <ViewPreview v-else-if="view" :file="file" :name="name" :revision="revision" :facts="view" large />
          <ReportThumbnail v-else :file="file" :name="baseName(file)" :revision="revision" :preview="readable && row.preview !== false" />
        </figure>
      </div>

      <div class="details-columns">
        <section class="details-summary" aria-label="Status">
          <span :class="['badge', 'details-status', assetBadges[row.category]]">{{ row.status }}</span>
          <h5 class="details-name" :title="row.resourcePath">{{ name }}</h5>
          <p class="details-folder text-muted"><i aria-hidden="true" class="mdi mdi-folder-outline" /> {{ splitPath(row.resource).folder }}</p>
          <div :class="['details-note', note.tone]">
            <i aria-hidden="true" :class="['mdi', note.icon]" />
            <p>{{ note.title }}<small>{{ note.text }}</small></p>
          </div>
          <p v-if="scope" class="details-scope text-muted"><i aria-hidden="true" class="mdi mdi-share-variant-outline" /> {{ scope }}</p>
          <p v-if="row.previewError" class="details-scope text-muted"><i aria-hidden="true" class="mdi mdi-image-off-outline" /> {{ row.previewError }}</p>
          <p v-if="row.rtfError" class="details-scope text-muted"><i aria-hidden="true" class="mdi mdi-book-alert-outline" /> {{ row.rtfError }}</p>
          <p v-if="row.viewError" class="details-scope text-muted"><i aria-hidden="true" class="mdi mdi-alert-outline" /> {{ row.viewError }}</p>

          <h6 class="details-heading">Loaded by</h6>
          <p v-if="!row.requiredBy.length" class="text-muted details-small">No JSON descriptor</p>
          <ul v-else class="details-list">
            <li v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="details-declaration">
              <span class="details-code">{{ use.descriptor }}:{{ use.line }}</span>
              <span class="badge badge-light">{{ use.type }}</span><span v-if="use.id" class="details-code">{{ use.id }}</span>
              <button type="button" class="details-icon" :aria-label="`Open ${use.descriptor} at line ${use.line} in VS Code`" :title="`Open in VS Code: ${use.descriptor}:${use.line}`" @click="openDeclaration(use.descriptor, use.line)"><i aria-hidden="true" class="mdi mdi-code-braces" /></button>
              <span v-if="use.size" class="text-muted">{{ use.size }} px</span>
              <span v-if="use.coverage" :class="['details-coverage', use.coverage.missingCount ? 'text-danger' : 'text-success']">
                <i aria-hidden="true" :class="['mdi', use.coverage.missingCount ? 'mdi-alert-outline' : 'mdi-check']" />{{ number(use.coverage.covered) }} of {{ number(use.coverage.declared) }} declared characters
              </span>
              <span v-if="use.coverage?.missingCount" class="details-missing">
                <span v-for="point in use.coverage.missing" :key="point" class="badge badge-light" :title="codePoint(point)">{{ codePoint(point) }} {{ String.fromCodePoint(point) }}</span>
                <span v-if="use.coverage.missingCount > use.coverage.missing.length" class="text-muted">+{{ number(use.coverage.missingCount - use.coverage.missing.length) }} more</span>
              </span>
            </li>
          </ul>

          <h6 class="details-heading">Game path</h6>
          <div class="details-path">
            <span class="details-code" :title="row.resourcePath">{{ row.resource }}</span>
            <button type="button" class="details-icon" :aria-label="`Copy the game path ${row.resourcePath}`" title="Copy the game path" @click="copy(row.resourcePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
            <button type="button" class="details-icon" :aria-label="`Open the game folder of ${name}`" title="Open the game folder" @click="openResourceFolder(file)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
          </div>
        </section>

        <section class="details-facts" aria-label="File details">
          <h6 class="details-heading mt-0">{{ sequence ? 'Files' : directory ? 'Folder' : 'File' }}</h6>
          <table class="table details-table">
            <tbody>
              <tr v-for="item in table" :key="item.label"><th scope="row">{{ item.label }}</th><td :class="{ 'is-different': 'warn' in item && item.warn }">{{ item.value }}</td></tr>
            </tbody>
          </table>

          <template v-if="rtf">
            <h6 class="details-heading">Pages</h6>
            <div class="details-frames">
              <table class="table table-sm">
                <thead><tr><th scope="col">Page</th><th scope="col">Resolution</th><th scope="col">Sections</th><th scope="col">Background</th></tr></thead>
                <tbody>
                  <tr v-for="(page, index) in rtf.pages" :key="page.id" :class="['details-page', { 'is-shown': index === rtfPage }]">
                    <td><button type="button" class="details-page-button" :aria-label="`Show page ${page.id}`" :aria-pressed="index === rtfPage" @click="rtfPage = index">{{ page.id }}</button></td>
                    <td class="text-nowrap">{{ page.width }} × {{ page.height }}</td>
                    <td>{{ number(page.sections) }}</td>
                    <td class="details-code" :title="page.background ?? undefined">
                      <span v-if="page.found">{{ baseName(page.background ?? '') }}</span>
                      <span v-else class="badge badge-warning">{{ page.background ? `${baseName(page.background)} missing` : 'not mapped' }}</span>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <template v-if="rtf.missingCount">
              <h6 class="details-heading">Missing files</h6>
              <ul class="details-list details-rtf-missing">
                <li v-for="file in rtf.missing" :key="`${file.kind}:${file.id}`">
                  <span class="badge badge-light">{{ file.kind }}</span><span class="details-code">{{ file.id }}</span>
                  <span class="details-code text-muted">{{ file.path ?? 'not mapped to a file' }}</span>
                </li>
                <li v-if="rtf.missingCount > rtf.missing.length" class="text-muted">+{{ number(rtf.missingCount - rtf.missing.length) }} more</li>
              </ul>
            </template>
          </template>

          <template v-if="view?.missingCount">
            <h6 class="details-heading">Missing resources</h6>
            <ul class="details-list details-rtf-missing">
              <li v-for="item in view.missing" :key="`${item.id}:${item.keys.join()}`">
                <span class="badge badge-light">{{ item.type }}</span><span class="details-code">{{ item.id }}</span>
                <span class="details-code text-muted">{{ item.reason }}</span>
              </li>
              <li v-if="view.missingCount > view.missing.length" class="text-muted">+{{ number(view.missingCount - view.missing.length) }} more</li>
            </ul>
          </template>

          <template v-if="directory?.files.length">
            <h6 class="details-heading">Files</h6>
            <div class="details-frames">
              <table class="table table-sm details-rtf-files">
                <thead><tr><th scope="col">File</th><th scope="col">Resolution</th><th scope="col">Size</th></tr></thead>
                <tbody>
                  <tr v-for="item in directory.files" :key="item.path">
                    <td class="details-code" :title="item.resourcePath"><i aria-hidden="true" :class="['mdi', typeIcons[item.type], 'text-muted']" /> {{ item.path }}</td>
                    <td class="text-nowrap">{{ item.dimensions ? `${item.dimensions.width} × ${item.dimensions.height}` : '—' }}</td>
                    <td class="text-nowrap">{{ size(item.size) }}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>

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
                <thead><tr><th scope="col">#</th><th scope="col">Game file</th><th scope="col">Status</th><th scope="col">Size</th></tr></thead>
                <tbody>
                  <tr v-for="frame in frameRows" :key="frame.index">
                    <td class="text-muted">{{ frame.index }}</td>
                    <td class="details-code" :title="frame.resourcePath">{{ frame.name }}</td>
                    <td><span :class="['badge', assetBadges[frame.category]]">{{ frame.category }}</span></td>
                    <td class="text-nowrap">{{ frame.size !== undefined ? size(frame.size) : '—' }}</td>
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
    </div>
  </AppModal>
</template>

<style scoped>
.details-declaration { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-bottom: 8px; }
.details-coverage { font-size: 12px; }
.details-coverage i { margin-right: 3px; }
.details-missing { display: flex; flex-wrap: wrap; gap: 4px; width: 100%; max-height: 96px; overflow-y: auto; }
.details-missing .badge { font-family: monospace; font-weight: 400; }
.details-page.is-shown td { background: #f2f2ff; }
.details-page-button { padding: 0; border: 0; background: transparent; color: #4b49ac; font-family: monospace; font-size: 12px; text-align: left; overflow-wrap: anywhere; cursor: pointer; }
.details-page-button:hover { text-decoration: underline; }
.details-rtf-missing li { display: flex; flex-wrap: wrap; align-items: baseline; gap: 6px; margin-bottom: 4px; }
</style>
