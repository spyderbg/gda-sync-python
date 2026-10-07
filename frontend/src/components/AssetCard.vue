<script setup lang="ts">
import { computed } from 'vue';
import { assetBadges, assetFrames, baseName, declarationLabel, number, plural, sequenceName, sequenceSummary, size, splitPath, typeIcons } from '../format';
import type { ReportAsset } from '../types';
import ReportThumbnail from './ReportThumbnail.vue';
import RtfPreview from './RtfPreview.vue';
import SequencePreview from './SequencePreview.vue';

// One asset of the asset report as a card, in the look of the Sync page's cards: its preview, name, folder, size and
// image size, the report's status, and the descriptor entries that load it. An image sequence plays its frames, and
// clicking its preview plays it again from the first frame. An RTF is its folder, named by it: it shows its pages, its
// languages, how many files the folder has, and how many of the files its pages draw are missing. Clicking the card, or its details button, emits open.
const props = withDefaults(defineProps<{ row: ReportAsset; revision: string; inspected?: boolean }>(), { inspected: false });
const emit = defineEmits<{ open: [] }>();

const resource = computed(() => splitPath(props.row.resource));
const sequence = computed(() => props.row.sequence);
const frames = computed(() => (sequence.value ? assetFrames(sequence.value) : []));
const readable = computed(() => props.row.category === 'available' || props.row.category === 'supplementary');
const dimensions = computed(() => (props.row.dimensions ? `${props.row.dimensions.width} × ${props.row.dimensions.height}` : ''));
// A sequence's files that do not exist or cannot be used, each once: an atlas repeats one file in many frames.
const unavailable = computed(() => [...new Map((sequence.value?.frames ?? [])
  .filter(frame => frame.category === 'missing' || frame.category === 'invalid')
  .map(frame => [frame.resourcePath, { ...frame, name: splitPath(frame.resource).name }])).values()]);
const shownUses = computed(() => props.row.requiredBy.slice(0, 3));
// The first Font entry whose declared characters the font does not all have.
const fontGap = computed(() => props.row.requiredBy.find(use => use.coverage?.missingCount));
const rtf = computed(() => (readable.value ? props.row.rtf : undefined));
// The file a preview shows: an RTF's .rtf file, or the asset's own.
const file = computed(() => props.row.directory?.project ?? props.row.resourcePath);
</script>

<template>
  <article :class="['card', 'asset-card', 'report-asset', `is-${row.category}`, { inspected }]">
    <SequencePreview v-if="sequence" :frames="frames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="sequence.id ?? resource.name" :revision="revision" />
    <div class="asset-hit-target" @click="emit('open')">
      <RtfPreview v-if="rtf" :file="file" :name="resource.name" :revision="revision" :facts="rtf" />
      <button v-else-if="!sequence" type="button" class="report-asset-preview" :aria-label="`Inspect ${resource.name}`">
        <ReportThumbnail :file="file" :name="baseName(file)" :revision="revision" :preview="readable && row.preview !== false" />
      </button>
      <div class="card-body">
        <p class="asset-name"><i aria-hidden="true" :class="['mdi', sequence ? 'mdi-animation-outline' : typeIcons[row.type]]" /><span :title="row.resourcePath">{{ resource.name }}</span></p>
        <p class="asset-meta"><span :title="row.resourcePath">{{ resource.folder }}</span><span v-if="row.size !== undefined">{{ size(row.size) }}</span></p>
        <p v-if="sequence" class="report-asset-sequence" :title="sequence.paths.join('\n')">
          <span :class="['report-asset-sequence-id', { 'is-guessed': sequence.guessed }]">{{ sequenceName(sequence) }}</span>{{ sequenceSummary(sequence) }}
        </p>
        <p v-if="rtf || row.directory" class="report-asset-sequence">
          <template v-if="rtf">{{ number(rtf.pages.length) }} page{{ plural(rtf.pages.length) }}<template v-if="rtf.languages.length"> · {{ rtf.languages.join(', ') }}</template> · </template>
          <template v-if="row.directory">{{ number(row.directory.files.length) }} file{{ plural(row.directory.files.length) }}</template>
        </p>
        <div class="asset-footer"><span :class="['badge', 'report-asset-status', assetBadges[row.category]]">{{ row.status }}</span><small v-if="dimensions">{{ dimensions }}</small></div>
        <div class="report-asset-declared">
          <small class="text-muted">{{ row.requiredBy.length ? 'Loaded by' : 'No JSON descriptor' }}</small>
          <span v-for="use in shownUses" :key="`${use.descriptor}:${use.line}`">{{ declarationLabel(use) }}</span>
          <span v-if="row.requiredBy.length > shownUses.length" class="text-muted">+{{ number(row.requiredBy.length - shownUses.length) }} more</span>
        </div>
        <p v-if="rtf?.missingCount" class="report-asset-warning">
          <i aria-hidden="true" class="mdi mdi-alert-outline" />{{ number(rtf.missingCount) }} file{{ plural(rtf.missingCount) }} that its pages draw {{ rtf.missingCount === 1 ? 'is' : 'are' }} missing
        </p>
        <p v-else-if="row.rtfError" class="report-asset-warning"><i aria-hidden="true" class="mdi mdi-alert-outline" />{{ row.rtfError }}</p>
        <p v-if="fontGap?.coverage" class="report-asset-warning">
          <i aria-hidden="true" class="mdi mdi-alert-outline" />{{ number(fontGap.coverage.missingCount) }} declared character{{ plural(fontGap.coverage.missingCount) }} of {{ fontGap.id ?? 'a Font entry' }} not in the font
        </p>
      </div>
    </div>
    <details v-if="unavailable.length" class="report-asset-frames">
      <summary>{{ number(unavailable.length) }} file{{ plural(unavailable.length) }} {{ row.category === 'invalid' ? 'not usable' : 'missing' }}</summary>
      <ul>
        <li v-for="frame in unavailable" :key="frame.resourcePath"><span :title="frame.resourcePath">{{ frame.name }}</span><small>{{ frame.category }}</small></li>
      </ul>
    </details>
    <button type="button" class="asset-menu" :aria-label="`Show details for ${resource.name}`" title="Show details" @click="emit('open')"><i aria-hidden="true" class="mdi mdi-dots-horizontal" /></button>
  </article>
</template>

<style scoped>
.report-asset { position: relative; display: flex; flex-direction: column; min-width: 0; width: 100%; }
.report-asset-preview { display: block; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.report-asset-preview:focus-visible { outline-offset: -2px; }
.asset-hit-target { cursor: pointer; }
.report-asset-status { max-width: 100%; white-space: normal; text-align: left; line-height: 1.3; overflow-wrap: anywhere; }
.report-asset-declared { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; font-size: 11px; overflow-wrap: anywhere; }
.report-asset-declared span { font-family: monospace; }
.report-asset-sequence { margin: -4px 0 10px; color: #8a939c; font-size: 11px; }
.report-asset-sequence-id { display: block; color: #6b7280; font-family: monospace; overflow-wrap: anywhere; }
.report-asset-sequence-id.is-guessed { font-family: inherit; font-style: italic; }
.report-asset-frames { padding: 0 1.15rem 10px; font-size: 11px; }
.report-asset-frames summary { color: #6c757d; cursor: pointer; }
.report-asset-frames ul { max-height: 160px; margin: 6px 0 0; padding: 0; overflow-y: auto; list-style: none; }
.report-asset-frames li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; font-family: monospace; line-height: 1.4; overflow-wrap: anywhere; }
.report-asset-frames small { flex-shrink: 0; color: #8a939c; font-family: inherit; }
.report-asset :deep(.thumbnail img) { object-fit: contain; }
.report-asset-warning { display: flex; gap: 4px; margin: 8px 0 0; color: #d2453c; font-size: 11px; }
</style>
