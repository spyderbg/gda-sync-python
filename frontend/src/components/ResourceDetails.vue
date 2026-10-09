<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { algorithmValues, baseName, viewTable, type GdaCandidate, declarationLabel, directoryOf, extensionOf, fileType, matchBadge, matchText, number, plural, previewFrames, rssBadges, rtfChangeBadges, rtfChangeNames, rtfChangeSummary, sequenceName, size, splitPath, time } from '../format';
import type { RssFileDetails, RssResource, RtfFacts } from '../types';
import { busy, copy, data, openDeclaration, openResourceFolder, requestResourceSync, resourceDetails, rssSync } from '../workspace';
import AppModal from './AppModal.vue';
import AudioPreview from './AudioPreview.vue';
import FontPreview from './FontPreview.vue';
import ReportThumbnail from './ReportThumbnail.vue';
import RtfPreview from './RtfPreview.vue';
import SequencePreview from './SequencePreview.vue';
import ViewPreview from './ViewPreview.vue';

// The details of one resource of the GDA sync report in a dialog, like the asset library's asset details (AssetDetails):
// a large preview, beside the GDA file's when the GDA has one, what the status means, the files' format, size,
// resolution, pixel format, mip levels and time, for the game and the GDA side by side, and where the resource is
// declared. An image sequence plays in the dialog, with how it plays, the totals of its files and each frame's status.
// An audio file plays once when the dialog opens, and each audio preview has a play and stop button. A font is drawn with
// itself on both sides, with the same text, and with the characters and at the size of the Font entry chosen; the table
// compares the fonts' names, glyph counts and how many of each Font entry's characters they have. An RTF draws the
// pages of the game's RTF and of the closest GDA one side by side, on the same page when both have it; the table compares
// the two projects, and the files of the folders are listed with what Sync does to each. An image lists how the image
// matching judged the GDA image it is compared with, with every algorithm's value. An image with GDA images to choose
// from (candidate) is shown only with the one given: the image chosen on its card, or else the most likely one, which
// Sync this resource copies. Left and Right choose the previous and next of its GDA images (candidates), which emits
// choose; the dialog stays open and compares the game image with the new one. Escape closes the dialog.
// reportVersion is the GDA sync report's version; one before FONT_REPORT_VERSION has no Font entry characters to check.
const props = withDefaults(defineProps<{
  row: RssResource; revision: string; reportVersion?: number; candidate?: GdaCandidate | null; candidates?: GdaCandidate[];
}>(), { reportVersion: undefined, candidate: null, candidates: () => [] });
const emit = defineEmits<{ close: []; choose: [file: string] }>();

const sequence = computed(() => props.row.sequence);
const name = computed(() => splitPath(props.row.resource).name);
const running = computed(() => !!rssSync.value?.running);
const unique = (paths: (string | null | undefined)[]) => [...new Set(paths.filter((path): path is string => !!path))];
/** Display workspace-relative paths; keep absolute paths for desktop and clipboard actions. */
function relativePath(path: string, root?: string) {
  if (!root) return path;
  const parts = (value: string) => value.replace(/\\/g, '/').replace(/\/$/, '').split('/');
  const file = parts(path), base = parts(root);
  const windows = /^[A-Za-z]:/.test(root) || root.startsWith('\\\\');
  const same = (a: string, b: string) => windows ? a.toLowerCase() === b.toLowerCase() : a === b;
  if (!same(file[0], base[0])) return path;
  let shared = 0;
  while (shared < file.length && shared < base.length && same(file[shared], base[shared])) shared++;
  return [...base.slice(shared).map(() => '..'), ...file.slice(shared)].join('/') || '.';
}
const gamePath = (path: string) => relativePath(path, data.value?.config.destination);
const gdaPath = (path: string) => relativePath(path, data.value?.config.source);
// An RTF's folder, and the page its previews show, by name: both RTFs show it when they have it.
const directory = computed(() => props.row.directory);
const rtfPage = ref<string | null>(null);
watch(() => props.row.id, () => { rtfPage.value = null; });
const pageIndex = (facts: RtfFacts) => { const index = facts.pages.findIndex(page => page.id === rtfPage.value); return index < 0 ? undefined : index; };
const choosePage = (facts: RtfFacts, index: number | undefined) => { rtfPage.value = index === undefined ? null : facts.pages[index]?.id ?? null; };
// An RTF's files that Sync copies or deletes first, then the identical ones.
const rtfFiles = computed(() => [...(directory.value?.files ?? [])].sort((a, b) => Number(!a.change || a.change === 'identical') - Number(!b.change || b.change === 'identical')));
const isAudio = (path: string) => fileType(extensionOf(baseName(path))) === 'audio';
// The GDA image an image is compared with: the given candidate, or else, in a report without candidates on the card, its
// closest same-named GDA file. Its evaluation by the image matching is listed, when it has one.
const gdaShown = computed(() => props.candidate ?? props.row.gdaFiles[0] ?? null);
// Where the GDA image shown is among the image's GDA images, as the card lists them.
const candidateIndex = computed(() => props.candidates.findIndex(candidate => candidate.absolutePath === props.candidate?.absolutePath));
/** Left and Right choose the previous and next GDA image that can be chosen, from the one shown; the first and last stay.
 * Keys typed into a text field, or with a modifier, are left alone. */
function onKeydown(event: KeyboardEvent) {
  const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  const target = event.target as HTMLElement | null;
  if (!direction || props.candidates.length < 2 || event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey
      || target?.closest('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  let index = candidateIndex.value + direction;
  while (index >= 0 && index < props.candidates.length && !props.candidates[index].syncable) index += direction;
  if (index >= 0 && index < props.candidates.length) emit('choose', props.candidates[index].absolutePath);
}
onMounted(() => document.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => document.removeEventListener('keydown', onKeydown));
const evaluated = computed(() => {
  const candidate = props.candidate;
  if (candidate) return [{ path: candidate.path, absolutePath: candidate.absolutePath, sameName: candidate.sameName, evaluation: candidate }];
  const file = sequence.value || directory.value ? null : props.row.gdaFiles[0];
  return file?.match ? [{ path: file.path, absolutePath: file.absolutePath, sameName: true, evaluation: file.match }] : [];
});

// The files described: a sequence's game files and the GDA file of each of its frames, each once. An RTF is described by
// the report.
const gameFiles = computed(() => (directory.value ? [] : sequence.value
  ? unique(sequence.value.frames.filter(frame => frame.category !== 'invalid').map(frame => frame.resourcePath))
  : props.row.category === 'invalid' ? [] : [props.row.resourcePath]));
const gdaFiles = computed(() => (directory.value ? [] : sequence.value
  ? unique(sequence.value.frames.map(frame => frame.gdaFiles[0]?.absolutePath))
  : gdaShown.value ? [gdaShown.value.absolutePath] : []));
const hasGda = computed(() => (directory.value ? !!directory.value.gdaProject : gdaFiles.value.length > 0));
const gdaLabel = computed(() => (sequence.value ? 'GDA frames'
  : directory.value ? (props.row.category === 'different' ? 'GDA folder, copied on sync' : 'Matching GDA folder')
    : props.candidate ? (props.candidate.syncable ? 'GDA image, copied on sync' : 'GDA image, the same file')
      : props.row.category === 'different' ? 'GDA file, copied on sync' : 'Matching GDA file'));
// Computed once per row: SequencePreview loads its frames again whenever it gets other ones.
const gameFrames = computed(() => (sequence.value ? previewFrames(sequence.value, 'game') : []));
const gdaFrames = computed(() => (sequence.value ? previewFrames(sequence.value, 'gda') : []));
// The GDA preview shows beside the game's for a resource that the GDA has.
const pairedPreview = computed(() => hasGda.value && (props.row.category === 'different' || props.row.category === 'identical' || !!props.candidate));
// The Font entries that declare characters of a font, and the one whose characters the previews draw.
const isFont = computed(() => !sequence.value && fileType(extensionOf(name.value)) === 'font');
const fontUses = computed(() => props.row.requiredBy.filter(use => use.chars));
const chosen = ref(0);
watch(() => props.row.id, () => { chosen.value = 0; });
const fontUse = computed(() => fontUses.value[chosen.value] ?? null);
const fontText = ref('');
// The GDA sync report version that lists the characters and size of Font entries: REPORT_VERSION in egt_gda_sync/rss_jobs.py.
const FONT_REPORT_VERSION = 4;
const fontsUnchecked = computed(() => isFont.value && (props.reportVersion ?? FONT_REPORT_VERSION) < FONT_REPORT_VERSION);
const coverageOf = (file: string) => details.value[file]?.coverage?.[chosen.value];

const details = ref<Record<string, RssFileDetails>>({});
const loading = ref(false);
const loadError = ref('');
let request = 0;
let described: [RssResource, string] | null = null;
// The files' details, read again for another resource or report. Another GDA image of the same resource only reads its
// own, so the game file's stay shown.
watch(() => [props.row, props.revision, gdaFiles.value.join('\n')] as const, async ([row, revision]) => {
  const id = ++request;
  const kept = described?.[0] === row && described[1] === revision ? details.value : {};
  described = [row, revision];
  const files = unique([...gameFiles.value, ...gdaFiles.value]).filter(file => !(file in kept)).slice(0, 1000);
  details.value = kept;
  loadError.value = '';
  if (!files.length) {
    loading.value = false;
    return;
  }
  loading.value = true;
  try {
    const result = await resourceDetails(files, fontUses.value.map(use => use.chars!));
    if (id === request) details.value = { ...kept, ...result };
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

/** What the table shows of a font: its format, names and glyph count, and how many of each Font entry's characters it has. */
function describeFont(files: string[]) {
  const entry = files.map(file => details.value[file]).find(item => item && !item.error);
  const none = loading.value ? '…' : '—';
  const font = entry?.font;
  return {
    format: font?.format ?? entry?.fontError ?? none, family: font?.family ?? none, style: font?.style ?? none,
    version: font?.version ?? none, glyphs: font?.glyphs !== undefined ? number(font.glyphs) : none,
    coverage: fontUses.value.map((_use, index) => {
      const result = entry?.coverage?.[index];
      return result ? `${number(result.covered)} of ${number(result.declared)}` : none;
    }),
  };
}

const table = computed(() => {
  const game = describe(gameFiles.value);
  const gda = describe(gdaFiles.value);
  let rows: { label: string; game: string; gda: string; compare: boolean }[];
  if (directory.value) {
    const folder = directory.value;
    const project = (facts?: RtfFacts, error?: string) => ({
      version: facts?.version ?? error ?? '—', languages: facts?.languages.join(', ') || '—',
      pages: facts ? `${number(facts.pages.length)}${facts.pages.length ? `, ${listed(facts.pages.map(page => `${page.width} × ${page.height}`))}` : ''}` : '—',
      media: facts ? `${number(facts.images)} image${plural(facts.images)}, ${number(facts.videos)} video${plural(facts.videos)}` : '—',
      missing: facts ? (facts.missingCount ? number(facts.missingCount) : 'None') : '—',
      texts: facts ? `${number(facts.texts)} text${plural(facts.texts)}, ${number(facts.styles)} style${plural(facts.styles)}` : '—',
    });
    const gameRtf = project(props.row.rtf, props.row.rtfError);
    const gdaRtf = project(props.row.gdaRtf, props.row.gdaRtfError);
    const files = (key: 'resourcePath' | 'gdaPath') => number(folder.files.filter(file => file[key]).length);
    rows = [
      { label: 'Tool version', game: gameRtf.version, gda: gdaRtf.version, compare: true },
      { label: 'Languages', game: gameRtf.languages, gda: gdaRtf.languages, compare: true },
      { label: 'Pages', game: gameRtf.pages, gda: gdaRtf.pages, compare: true },
      { label: 'Images and videos', game: gameRtf.media, gda: gdaRtf.media, compare: true },
      { label: 'Missing files', game: gameRtf.missing, gda: gdaRtf.missing, compare: true },
      { label: 'Texts and styles', game: gameRtf.texts, gda: gdaRtf.texts, compare: true },
      { label: 'Files', game: files('resourcePath'), gda: hasGda.value ? files('gdaPath') : '—', compare: true },
    ];
  } else if (props.row.view || props.row.viewError) {
    // A view: what it and its closest GDA file draw, then the files.
    const gameView = props.row.view ? viewTable(props.row.view) : [];
    const gdaView = props.row.gdaView ? viewTable(props.row.gdaView) : [];
    rows = [
      ...gameView.map((item, index) => ({ label: item.label, game: item.value, gda: hasGda.value ? (gdaView[index]?.value ?? props.row.gdaViewError ?? '—') : '—', compare: index > 0 })),
      ...(gameView.length ? [] : [{ label: 'View', game: props.row.viewError ?? '—', gda: props.row.gdaViewError ?? '—', compare: false }]),
      { label: 'File size', game: game.size, gda: gda.size, compare: true },
      { label: 'Last modified', game: game.modified, gda: gda.modified, compare: false },
    ];
  } else if (isFont.value) {
    const gameFont = describeFont(gameFiles.value);
    const gdaFont = describeFont(gdaFiles.value);
    rows = [
      { label: 'Font format', game: gameFont.format, gda: gdaFont.format, compare: true },
      { label: 'Family', game: gameFont.family, gda: gdaFont.family, compare: true },
      { label: 'Style', game: gameFont.style, gda: gdaFont.style, compare: true },
      { label: 'Version', game: gameFont.version, gda: gdaFont.version, compare: true },
      { label: 'Glyphs', game: gameFont.glyphs, gda: gdaFont.glyphs, compare: true },
      ...fontUses.value.map((use, index) => ({
        label: `Characters of ${use.id ?? `${use.descriptor}:${use.line}`}`, game: gameFont.coverage[index], gda: gdaFont.coverage[index], compare: true,
      })),
      { label: 'File size', game: game.size, gda: gda.size, compare: true },
      { label: 'Last modified', game: game.modified, gda: gda.modified, compare: false },
    ];
  } else {
    const keys: { label: string; key: keyof typeof game; compare: boolean }[] = [
      { label: 'File format', key: 'format', compare: true },
      ...(sequence.value ? [{ label: 'Files', key: 'files' as const, compare: false }] : []),
      { label: sequence.value ? 'Total size' : 'File size', key: 'size', compare: true },
      { label: 'Resolution', key: 'resolution', compare: true },
      { label: 'Pixel format', key: 'pixelFormat', compare: true },
      { label: 'Mip levels', key: 'mipmaps', compare: true },
      { label: sequence.value ? 'Last modified, newest' : 'Last modified', key: 'modified', compare: false },
    ];
    rows = keys.map(({ label, key, compare }) => ({ label, game: game[key], gda: gda[key], compare }));
  }
  return rows.map(({ label, game: gameValue, gda: gdaValue, compare }) => ({
    label, game: gameValue, gda: gdaValue,
    // A value that differs between the game and the GDA stands out.
    differs: hasGda.value && compare && gameValue !== gdaValue && ![gameValue, gdaValue].some(value => value === '—' || value === '…'),
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
  const folder = directory.value;
  if (folder) {
    const project = baseName(folder.project);
    switch (props.row.category) {
      case 'identical': return { icon: 'mdi-check-all', tone: 'is-synced', title: 'Everything looks good.', text: 'The GDA folder has an identical copy of every file of this RTF.' };
      case 'different': return {
        icon: 'mdi-sync', tone: 'is-pending', title: 'The GDA has another version.',
        text: `Sync makes this RTF's folder a copy of the closest GDA folder (${rtfChangeSummary(folder)}), and keeps the replaced and deleted files in your backups. A file that a descriptor declares is never deleted.`,
      };
      case 'missing': return { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder.', text: `No GDA folder holds a file named ${project}, so there is nothing to copy.` };
      case 'invalid': return { icon: 'mdi-alert-circle-outline', tone: 'is-invalid', title: 'The declared path cannot be used.', text: props.row.status.replace(/^invalid: /, '') };
      default: return {
        icon: 'mdi-file-question-outline', tone: 'is-supplementary', title: 'Not declared.',
        text: `No descriptor declares its ${project}, so the game does not load it, and it is not compared with the GDA folder.`,
      };
    }
  }
  switch (props.row.category) {
    case 'identical': return { icon: 'mdi-check-all', tone: 'is-synced', title: 'Everything looks good.', text: `The GDA folder has an identical ${many ? 'file for every frame' : 'file'}.` };
    case 'different': return {
      icon: 'mdi-sync', tone: 'is-pending', title: 'The GDA has another version.',
      text: many ? 'Sync copies the GDA file of each different frame over the game file, and keeps the replaced files in your backups.'
        : 'Sync copies the GDA file over the game file, and keeps the replaced file in your backups.',
    };
    case 'missing': return props.candidate
      ? { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder by name.', text: 'No GDA file has this name, but GDA images may show the same picture. Sync copies the one shown over the game file, and keeps the replaced file in your backups.' }
      : { icon: 'mdi-file-search-outline', tone: 'is-pending', title: 'Not in the GDA folder.', text: `No GDA file has ${many ? 'the name of these files' : 'this name'}, so there is nothing to copy.` };
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
const syncable = computed(() => (props.candidate ? props.candidate.syncable
  : props.row.category === 'different' && props.row.gdaFiles.length > 0));

function sync() {
  emit('close');
  requestResourceSync([props.row], props.candidate ? { [props.row.id]: props.candidate } : {});
}
</script>

<template>
  <AppModal :title="name" xl @close="emit('close')">
    <div class="modal-body details-dialog">
      <div :class="['details-previews', { 'is-paired': pairedPreview }]">
        <figure class="details-preview">
          <figcaption>
            {{ sequence ? 'Game frames' : directory ? 'Game folder' : row.view ? 'Game view, as the game draws it' : 'Game file' }}<small v-if="sequence">Click to play again</small>
            <span v-if="isFont && fontUses.length > 1" class="btn-group btn-group-sm" role="group" aria-label="Characters of the Font entry">
              <button v-for="(use, index) in fontUses" :key="`${use.descriptor}:${use.line}`" type="button" :class="['btn', 'btn-secondary', { active: index === chosen }]" :aria-pressed="index === chosen" @click="chosen = index">{{ use.id ?? `${use.descriptor}:${use.line}` }}</button>
            </span>
          </figcaption>
          <SequencePreview v-if="sequence" :frames="gameFrames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="sequence.id ?? name" :revision="revision" />
          <RtfPreview v-else-if="directory && row.rtf" :page="pageIndex(row.rtf)" :file="directory.project" :name="name" :revision="revision" :facts="row.rtf" large @update:page="choosePage(row.rtf, $event)" />
          <AudioPreview v-else-if="isAudio(row.resourcePath) && row.category !== 'invalid'" :file="row.resourcePath" :name="name" :revision="revision" autoplay />
          <FontPreview v-else-if="isFont && row.category !== 'invalid'" v-model:text="fontText" :file="row.resourcePath" :name="name" :revision="revision" large
                       :chars="fontUse?.chars" :size="fontUse?.size" :missing="coverageOf(row.resourcePath)?.missing" />
          <ViewPreview v-else-if="row.view" :file="row.resourcePath" :name="name" :revision="revision" :facts="row.view" large />
          <ReportThumbnail v-else :file="directory?.project ?? row.resourcePath" :name="directory ? baseName(directory.project) : name" :revision="revision" :preview="row.category !== 'invalid'" />
        </figure>
        <figure v-if="pairedPreview" class="details-preview">
          <figcaption>
            {{ gdaLabel }}<small v-if="candidate && candidates.length > 1 && candidateIndex >= 0" class="details-candidate-position">{{ candidateIndex + 1 }} of {{ candidates.length }} · Left and Right change it</small>
          </figcaption>
          <SequencePreview v-if="sequence" :frames="gdaFrames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="`${sequence.id ?? name} from the GDA`" :revision="revision" />
          <RtfPreview v-else-if="directory?.gdaProject && row.gdaRtf" :page="pageIndex(row.gdaRtf)" :file="directory.gdaProject" :name="`${baseName(row.gdaFiles[0].path)} from the GDA`" :revision="revision" :facts="row.gdaRtf" large @update:page="choosePage(row.gdaRtf, $event)" />
          <ReportThumbnail v-else-if="directory?.gdaProject" :file="directory.gdaProject" :name="baseName(directory.gdaProject)" :revision="revision" />
          <ViewPreview v-else-if="row.gdaView && gdaShown" :file="gdaShown.absolutePath" :name="`${baseName(gdaShown.path)} from the GDA`" :revision="revision" :facts="row.gdaView" large />
          <AudioPreview v-else-if="isAudio(gdaShown!.path)" :file="gdaShown!.absolutePath" :name="baseName(gdaShown!.path)" :revision="revision" />
          <FontPreview v-else-if="isFont" v-model:text="fontText" :file="gdaShown!.absolutePath" :name="baseName(gdaShown!.path)" :revision="revision" large
                       :chars="fontUse?.chars" :size="fontUse?.size" :missing="coverageOf(gdaShown!.absolutePath)?.missing" />
          <ReportThumbnail v-else :file="gdaShown!.absolutePath" :name="baseName(gdaShown!.path)" :revision="revision" />
        </figure>
      </div>

      <div class="details-columns">
        <section class="details-summary" aria-label="Status">
          <span :class="['badge', 'details-status', rssBadges[row.category]]">{{ row.category === 'missing' ? 'missing: no GDA file' : row.status }}</span>
          <h5 class="details-name" :title="row.resourcePath">{{ name }}</h5>
          <p class="details-folder text-muted"><i aria-hidden="true" class="mdi mdi-folder-outline" /> {{ splitPath(row.resource).folder }}</p>
          <div :class="['details-note', note.tone]">
            <i aria-hidden="true" :class="['mdi', note.icon]" />
            <p>{{ note.title }}<small>{{ note.text }}</small></p>
          </div>
          <p v-if="scope" class="details-scope text-muted"><i aria-hidden="true" class="mdi mdi-share-variant-outline" /> {{ scope }}</p>

          <p v-if="fontsUnchecked" class="details-scope text-muted">
            <i aria-hidden="true" class="mdi mdi-information-outline" /> This report was written by an earlier version, without the characters that Font entries declare. Rescan to check both fonts against them.
          </p>
          <h6 class="details-heading">Declared in</h6>
          <p v-if="!row.requiredBy.length" class="text-muted details-small">No JSON descriptor</p>
          <ul v-else class="details-list">
            <li v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="details-path">
              <span class="details-code">{{ declarationLabel(use) }}</span>
              <button type="button" class="details-icon" :aria-label="`Open ${use.descriptor} at line ${use.line} in VS Code`" :title="`Open in VS Code: ${use.descriptor}:${use.line}`" @click="openDeclaration(use.descriptor, use.line)"><i aria-hidden="true" class="mdi mdi-code-braces" /></button>
            </li>
          </ul>

          <h6 class="details-heading">Game path</h6>
          <div class="details-path">
            <span class="details-code" :title="row.resourcePath">{{ gamePath(row.resourcePath) }}</span>
            <button type="button" class="details-icon" :aria-label="`Copy the game path ${row.resourcePath}`" title="Copy the game path" @click="copy(row.resourcePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
            <button type="button" class="details-icon" :aria-label="`Open the game folder of ${name}`" title="Open the game folder" @click="openResourceFolder(directory?.project ?? row.resourcePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
          </div>
          <template v-if="sequence && gdaFolders.length">
            <h6 class="details-heading">GDA folder{{ plural(gdaFolders.length) }}</h6>
            <div v-for="item in gdaFolders" :key="item.folder" class="details-path">
              <span class="details-code" :title="item.folder">{{ gdaPath(item.folder) }}</span>
              <button type="button" class="details-icon" :aria-label="`Copy the GDA folder ${item.folder}`" title="Copy the GDA folder" @click="copy(item.folder)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
              <button type="button" class="details-icon" :aria-label="`Open the GDA folder ${item.folder}`" title="Open the GDA folder" @click="openResourceFolder(item.file)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
            </div>
          </template>
          <template v-else-if="candidate">
            <h6 class="details-heading">GDA image</h6>
            <div class="details-path">
              <span class="details-code" :title="candidate.absolutePath">{{ gdaPath(candidate.absolutePath) }}</span>
              <button type="button" class="details-icon" :aria-label="`Copy the GDA path ${candidate.path}`" title="Copy the GDA path" @click="copy(candidate.absolutePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
              <button type="button" class="details-icon" :aria-label="`Open the GDA folder of ${candidate.path}`" title="Open the GDA folder" @click="openResourceFolder(candidate.absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
            </div>
            <span :class="['badge', candidate.syncable ? 'badge-primary' : 'badge-light']">{{ candidate.syncable ? 'Copied on sync' : 'Same file as the game' }}</span>
          </template>
          <template v-else-if="row.gdaFiles.length">
            <h6 class="details-heading">GDA {{ directory ? 'folder' : 'file' }}{{ plural(row.gdaFiles.length) }}{{ row.gdaFiles.length > 1 ? (directory ? ', closest first' : ', closest folder first') : '' }}</h6>
            <div v-for="(file, index) in row.gdaFiles" :key="file.absolutePath" class="details-path-entry">
              <div class="details-path">
                <span class="details-code" :title="file.absolutePath">{{ gdaPath(file.absolutePath) }}</span>
                <button type="button" class="details-icon" :aria-label="`Copy the GDA path ${file.path}`" title="Copy the GDA path" @click="copy(file.absolutePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
                <button type="button" class="details-icon" :aria-label="`Open the GDA folder of ${file.path}`" title="Open the GDA folder" @click="openResourceFolder(directory ? `${file.absolutePath}/${baseName(directory.project)}` : file.absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
              </div>
              <span v-if="row.category === 'different'" :class="['badge', index ? 'badge-light' : 'badge-primary']">{{ index ? 'Other match' : 'Copied on sync' }}</span>
            </div>
          </template>
        </section>

        <section class="details-facts" aria-label="File details">
          <h6 class="details-heading mt-0">{{ sequence ? 'Files' : directory ? 'RTF' : 'File' }}</h6>
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

          <template v-if="evaluated.length || row.imageMatch?.error">
            <h6 class="details-heading">Image matching</h6>
            <p v-if="row.imageMatch?.error" class="text-muted details-small">This image could not be decoded: {{ row.imageMatch.error }}</p>
            <div v-for="item in evaluated" :key="item.absolutePath" class="details-match">
              <p class="details-match-title">
                <span class="details-code" :title="item.absolutePath">{{ item.path }}</span>
                <span :class="['badge', matchBadge(item.evaluation)]">{{ matchText(item.evaluation) }}</span>
                <small class="text-muted">{{ item.sameName ? 'same name' : 'other name' }}</small>
              </p>
              <table class="table table-sm details-table">
                <tbody>
                  <tr v-for="value in algorithmValues(item.evaluation.algorithms)" :key="value.name">
                    <th scope="row">{{ value.name }}</th><td>{{ value.value }}</td>
                    <td class="text-muted">{{ value.probability === undefined ? '' : `${value.probability.toFixed(1)} %` }}</td>
                  </tr>
                </tbody>
              </table>
              <p v-if="item.evaluation.stoppedBy === 'ssim'" class="text-muted details-small">SIFT did not run: SSIM already shows a near duplicate.</p>
            </div>
          </template>

          <template v-if="directory">
            <h6 class="details-heading">Files<small v-if="row.category === 'different'" class="text-muted"> · copied on sync: {{ rtfChangeSummary(directory) }}</small></h6>
            <div class="details-frames">
              <table class="table table-sm details-rtf-files">
                <thead><tr><th scope="col">File</th><th v-if="hasGda" scope="col">On sync</th></tr></thead>
                <tbody>
                  <tr v-for="file in rtfFiles" :key="file.path">
                    <td class="details-code" :title="file.resourcePath ?? file.gdaPath ?? undefined">{{ file.path }}</td>
                    <td v-if="hasGda">
                      <span v-if="file.change" :class="['badge', rtfChangeBadges[file.change]]">{{ rtfChangeNames[file.change] }}</span>
                      <small v-if="file.mipOnly" class="text-muted ml-1">mip levels differ</small>
                    </td>
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
