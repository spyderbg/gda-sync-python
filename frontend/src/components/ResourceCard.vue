<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import { algorithmTitle, baseName, declarationLabel, directoryOf, extensionOf, fileType, matchText, number, plural, previewFrames, resourceAction, rssBadges, rssStatusNames, rtfChangeNames, rtfChangeSummary, sequenceName, sequenceSummary, splitPath, typeIcons, type GdaCandidate } from '../format';
import type { RssResource } from '../types';
import { copy, openDeclaration, openResourceFolder } from '../workspace';
import CheckBox from './CheckBox.vue';
import ReportThumbnail from './ReportThumbnail.vue';
import RtfPreview from './RtfPreview.vue';
import SequencePreview from './SequencePreview.vue';

// One resource of the GDA sync report as a card in the look of AssetCard: the game file's preview, name, folder and the
// report's status. A "different" resource also shows its GDA files as cards, closest folder first. Sync copies the first
// of them over the game file. A resource with an action, which a "missing" one has not, can be selected with its check
// box, which emits toggle.
// Clicking the card, or its details button, emits open to show the resource's details.
// An image sequence is one card that plays its frames, and clicking its preview plays it again from the first frame.
// It lists its files that are not in sync, and a "different" one plays the GDA files of its frames beside it.
// A "supplementary" file is in the game folder, but no descriptor declares it; numbered images among them are played
// as a guessed sequence.
// An RTF is one card for its folder, which shows its pages and lists its files that are not in sync; a "different" one
// shows the pages of the closest GDA folder beside it, which Sync makes the game's folder a copy of, and the other GDA
// folders that hold a .rtf file of its name.
// A different or missing image shows its candidates, the GDA images that may show the same picture (possible matches by
// content, and its same-named GDA files), on one line, most likely first, each with its probability and match type.
// Clicking one chooses it, or clears the choice, which emits choose: Sync copies the chosen image, so the copy button
// waits for a choice. One with the game file's contents cannot be chosen, since copying it changes nothing. The whole
// card of a GDA image chooses it, and Left and Right choose the previous and next GDA image. The game image's card and the
// GDA images' cards are one size; only the GDA images scroll sideways, right of the copy arrow.
const props = withDefaults(defineProps<{
  row: RssResource; revision: string; selected?: boolean; syncDisabled?: boolean; candidates?: GdaCandidate[]; chosen?: string | null;
}>(), { selected: false, syncDisabled: false, candidates: () => [], chosen: null });
const emit = defineEmits<{ toggle: []; open: []; sync: []; choose: [file: string | null] }>();

const icon = (name: string) => typeIcons[fileType(extensionOf(name))];
const directory = computed(() => props.row.directory);

const resource = computed(() => splitPath(props.row.resource));
const resourceDirectory = computed(() => directoryOf(props.row.resourcePath));
const selectable = computed(() => !!resourceAction(props.row));
const matching = computed(() => props.candidates.length > 0);
const chosenCandidate = computed(() => props.candidates.find(candidate => candidate.absolutePath === props.chosen) ?? null);
const syncable = computed(() => (matching.value ? !!chosenCandidate.value?.syncable : resourceAction(props.row) === 'sync'));
// The GDA images' scroll area, and the height of its scroll bar, which the game image's card leaves room for below it so
// that it stays as tall as the GDA images' cards.
const strip = ref<HTMLElement | null>(null);
const gutter = ref(0);
watch(strip, (element, _previous, onCleanup) => {
  if (!element || typeof ResizeObserver === 'undefined') return;
  const measure = () => { gutter.value = element.offsetHeight - element.clientHeight; };
  const observer = new ResizeObserver(measure);
  observer.observe(element);
  measure();
  onCleanup(() => observer.disconnect());
});
const STRIP_PADDING = 3;  // .resource-candidates' padding, so the chosen card's ring shows
/** Scroll the GDA images sideways, and only sideways, so the chosen one's card is in view: a choice made in the details
 * dialog shows when it closes, without moving the page behind the dialog. */
function reveal() {
  const element = strip.value;
  const index = props.candidates.findIndex(candidate => candidate.absolutePath === props.chosen);
  const card = index >= 0 ? element?.querySelector<HTMLElement>(`[data-index="${index}"]`) : null;
  if (!element || !card) return;
  const area = element.getBoundingClientRect(), box = card.getBoundingClientRect();
  if (box.left < area.left) element.scrollLeft -= area.left - box.left + STRIP_PADDING;
  else if (box.right > area.right) element.scrollLeft += box.right - area.right + STRIP_PADDING;
}
watch(() => props.chosen, () => nextTick(reveal));
/** Left and Right choose the previous and next GDA image that can be chosen: from the chosen one, or else from the
 * focused one, or else the first or last. The new choice gets the focus and scrolls into view. */
function onKeydown(event: KeyboardEvent) {
  const direction = { ArrowLeft: -1, ArrowRight: 1 }[event.key];
  if (!direction || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
  event.preventDefault();
  const list = props.candidates;
  const focused = Number((event.target as HTMLElement).closest<HTMLElement>('[data-index]')?.dataset.index ?? NaN);
  const chosenIndex = list.findIndex(candidate => candidate.absolutePath === props.chosen);
  let index = (chosenIndex >= 0 ? chosenIndex : Number.isNaN(focused) ? (direction > 0 ? -1 : list.length) : focused) + direction;
  while (index >= 0 && index < list.length && !list[index].syncable) index += direction;
  if (index < 0 || index >= list.length) return;
  emit('choose', list[index].absolutePath);
  nextTick(() => strip.value?.querySelector<HTMLButtonElement>(`[data-index="${index}"] .resource-candidate-select`)?.focus({ preventScroll: true }));
}
function candidateLabel(candidate: GdaCandidate) {
  if (candidate.absolutePath === props.chosen) return 'Copied on sync';
  if (!candidate.syncable) return 'Same file as the game';
  return candidate.sameName ? 'Same name' : 'Other name';
}
const gdaFiles = computed(() => props.row.gdaFiles.map(file => ({ ...file, ...splitPath(file.path), directory: directoryOf(file.absolutePath) })));

const sequence = computed(() => props.row.sequence);
const copyLabel = computed(() => (matching.value
  ? (chosenCandidate.value ? `Copy GDA image ${chosenCandidate.value.path} over game file ${props.row.resource}` : `Select a GDA image to copy over ${props.row.resource}`)
  : sequence.value ? `Copy different GDA frames over game files for ${props.row.resource}`
    : directory.value ? `Make the RTF folder ${props.row.resource} a copy of its GDA folder` : `Copy GDA file over game file for ${props.row.resource}`));
// The game side plays the game files, and the GDA side the GDA file of each frame: the one that matched, or the closest,
// which sync copies. A frame without a file to show stays empty.
const gameFrames = computed(() => (sequence.value ? previewFrames(sequence.value, 'game') : []));
const gdaFrames = computed(() => (sequence.value ? previewFrames(sequence.value, 'gda') : []));
// Each file once: an atlas repeats one file in many frames.
const unsynced = computed(() => (directory.value
  // An RTF's files that Sync copies or deletes.
  ? directory.value.files.filter(file => file.change && file.change !== 'identical')
    .map(file => ({ resourcePath: file.resourcePath ?? file.gdaPath ?? file.path, name: file.path, status: rtfChangeNames[file.change!] }))
  : [...new Map((sequence.value?.frames ?? [])
    .filter(frame => frame.category !== 'identical' && frame.category !== 'skipped' && frame.category !== 'supplementary')
    .map(frame => [frame.resourcePath, { ...frame, name: splitPath(frame.resource).name }])).values()]));
// A sequence's different files that have a GDA file to copy, each once.
const copied = computed(() => new Set((sequence.value?.frames ?? []).filter(frame => frame.category === 'different' && frame.gdaFiles.length).map(frame => frame.resourcePath)).size);
const gdaFolders = computed(() => [...new Set(gdaFiles.value.map(file => file.directory))]);
// The absolute folder of the first GDA file, whatever the separators of the backend's platform.
const gdaFolder = computed(() => gdaFiles.value[0]?.directory ?? '');
</script>

<template>
  <div :class="['resource-card', `is-${row.category}`, { 'is-matching': matching }]" :style="matching ? { '--strip-gutter': `${gutter}px` } : undefined">
    <article :class="['card', 'asset-card', 'resource-game', { selected }]">
      <SequencePreview v-if="sequence" :frames="gameFrames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="sequence.id ?? resource.name" :revision="revision" />
      <div class="asset-hit-target" @click="emit('open')">
        <RtfPreview v-if="directory && row.rtf" :file="directory.project" :name="resource.name" :revision="revision" :facts="row.rtf" />
        <button v-else-if="!sequence" type="button" class="resource-preview" :aria-label="`Show the details of ${row.resource}`">
          <ReportThumbnail :file="directory?.project ?? row.resourcePath" :name="directory ? baseName(directory.project) : resource.name" :revision="revision" :preview="row.category !== 'invalid'" />
        </button>
        <div class="card-body">
          <p class="asset-name"><button type="button" class="resource-icon-button resource-file-copy" :aria-label="`Copy the game path of ${resource.name}`" title="Copy the game path" @click.stop="copy(row.resourcePath)"><i aria-hidden="true" :class="['mdi', sequence ? 'mdi-animation-outline' : directory ? typeIcons.rtf : icon(resource.name)]" /></button><span :title="row.resourcePath">{{ resource.name }}</span></p>
          <p class="asset-meta"><span class="resource-folder"><button type="button" class="resource-icon-button resource-folder-open" :aria-label="`Open game directory ${resourceDirectory}`" :title="`Open ${resourceDirectory}`" @click.stop="openResourceFolder(row.resourcePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button><span :title="resourceDirectory">{{ resourceDirectory }}</span></span><span v-if="row.scope !== 'game'">{{ row.scope }}</span></p>
          <p v-if="sequence" class="resource-sequence" :title="sequence.paths.join('\n')">
            <span :class="['resource-sequence-id', { 'is-guessed': sequence.guessed }]">{{ sequenceName(sequence) }}</span>{{ sequenceSummary(sequence) }}<template v-if="sequence.paths.length > 1"> · {{ sequence.paths.length }} paths</template>
          </p>
          <p v-if="directory" class="resource-sequence">
            <template v-if="row.rtf">{{ number(row.rtf.pages.length) }} page{{ plural(row.rtf.pages.length) }} · </template>{{ number(directory.files.filter(file => file.resourcePath).length) }} files
          </p>
          <div class="asset-footer"><span :class="['badge', 'resource-status', rssBadges[row.category]]">{{ rssStatusNames[row.category] }}</span></div>
          <div v-if="row.category !== 'different' && !matching" class="resource-declared">
            <small class="text-muted">{{ row.requiredBy.length ? 'Declared in' : 'No JSON descriptor' }}</small>
            <div v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="resource-declaration">
              <button type="button" class="resource-icon-button resource-declaration-open" :aria-label="`Open ${use.descriptor} at line ${use.line} in VS Code`" :title="`Open in VS Code: ${use.descriptor}:${use.line}`" @click.stop="openDeclaration(use.descriptor, use.line)"><i aria-hidden="true" class="mdi mdi-code-braces" /></button>
              <span>{{ declarationLabel(use) }}</span>
            </div>
          </div>
        </div>
      </div>
      <details v-if="unsynced.length" class="resource-frames">
        <summary>{{ number(unsynced.length) }} file{{ plural(unsynced.length) }} not in sync</summary>
        <ul>
          <li v-for="frame in unsynced" :key="frame.resourcePath"><span :title="frame.resourcePath">{{ frame.name }}</span><small>{{ frame.status }}</small></li>
        </ul>
      </details>
      <CheckBox v-if="selectable" class="asset-check" :checked="selected" :label="`Select ${row.resource}`" @change="emit('toggle')" />
      <button type="button" class="asset-menu" :aria-label="`Show details for ${resource.name}`" title="Show details" @click="emit('open')"><i aria-hidden="true" class="mdi mdi-dots-horizontal" /></button>
    </article>

    <div v-if="row.category === 'different' || matching" class="resource-operation">
      <button type="button" class="resource-copy-button" :aria-label="copyLabel" :title="copyLabel"
              :disabled="syncDisabled || !syncable" @click.stop="emit('sync')">
        <img src="/icons/gda-copy-left.png" class="resource-copy-icon" alt="" aria-hidden="true" width="36" height="36">
      </button>
      <small v-if="matching" class="resource-operation-hint">
        {{ chosenCandidate ? `Copies ${baseName(chosenCandidate.path)}` : 'Choose a GDA image' }}<br>{{ number(candidates.length) }} image{{ plural(candidates.length) }}
      </small>
    </div>

    <section v-if="matching" ref="strip" class="resource-gda resource-candidates" :aria-label="`GDA images that may show ${resource.name}`"
             aria-description="Left and Right choose the previous and next image" @keydown="onKeydown">
        <article v-for="(candidate, index) in candidates" :key="candidate.absolutePath" :data-index="index"
                 :class="['card', 'asset-card', 'gda-file-card', 'resource-candidate', { selected: candidate.absolutePath === chosen, chosen: candidate.absolutePath === chosen, 'is-unsyncable': !candidate.syncable }]">
          <button type="button" class="resource-candidate-select" :aria-pressed="candidate.absolutePath === chosen" :disabled="!candidate.syncable"
                  :aria-label="`${candidate.absolutePath === chosen ? 'Clear the choice of' : 'Choose'} GDA image ${candidate.path} for ${row.resource}`"
                  :title="`${candidate.absolutePath}\n${algorithmTitle(candidate)}`" @click="emit('choose', candidate.absolutePath === chosen ? null : candidate.absolutePath)">
            <ReportThumbnail :file="candidate.absolutePath" :name="baseName(candidate.path)" :revision="revision" />
            <span class="resource-candidate-name"><i aria-hidden="true" :class="['mdi', icon(candidate.path)]" />{{ baseName(candidate.path) }}</span>
            <span class="resource-candidate-match">{{ matchText(candidate) }}</span>
          </button>
          <div class="card-body resource-candidate-body">
            <p class="asset-meta"><span class="resource-folder"><button type="button" class="resource-icon-button resource-folder-open" :aria-label="`Open GDA directory ${directoryOf(candidate.absolutePath)}`" :title="`Open ${directoryOf(candidate.absolutePath)}`" @click="openResourceFolder(candidate.absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button><span :title="directoryOf(candidate.absolutePath)">{{ directoryOf(candidate.absolutePath) }}</span></span><span v-if="candidate.tree === 'common'">common GDA</span></p>
            <div class="asset-footer">
              <span :class="['badge', 'resource-status', candidate.absolutePath === chosen ? 'badge-primary' : 'badge-light']">{{ candidateLabel(candidate) }}</span>
            </div>
          </div>
        </article>
    </section>
    <section v-else-if="row.category === 'different' && sequence" class="resource-gda" :aria-label="`GDA files of ${sequence.id}`">
      <div class="resource-gda-files">
        <article class="card asset-card gda-file-card">
          <SequencePreview :frames="gdaFrames" :frame-time="sequence.frameTime" :loop-count="sequence.loopCount" :loop-to="sequence.loopTo" :name="`${sequence.id} from the GDA`" :revision="revision" />
          <div class="card-body">
            <p class="asset-name"><button type="button" class="resource-icon-button resource-file-copy" :aria-label="`Copy the GDA folder ${gdaFolders[0]}`" title="Copy the GDA folder" @click="copy(gdaFolder)"><i aria-hidden="true" class="mdi mdi-animation-outline" /></button><span :title="gdaFolder">{{ resource.name }}</span></p>
            <p class="asset-meta"><span class="resource-folder"><button type="button" class="resource-icon-button resource-folder-open" :aria-label="`Open GDA directory ${gdaFolder}`" :title="`Open ${gdaFolder}`" @click="openResourceFolder(gdaFiles[0].absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button><span :title="gdaFolders.join('\n')">{{ gdaFolder }}</span></span><span v-if="gdaFolders.length > 1">+{{ gdaFolders.length - 1 }} folder{{ plural(gdaFolders.length - 1) }}</span></p>
            <p class="resource-sequence"><span class="resource-sequence-id">{{ sequence.id }}</span>{{ sequenceSummary(sequence) }}</p>
            <div class="asset-footer">
              <span class="badge badge-primary resource-status">{{ number(copied) }} file{{ plural(copied) }} copied on sync</span>
            </div>
          </div>
        </article>
      </div>
    </section>
    <section v-else-if="row.category === 'different' && directory" class="resource-gda" :aria-label="`GDA folders of ${resource.name}`">
      <div class="resource-gda-files">
        <article v-for="(folder, index) in gdaFiles" :key="folder.absolutePath" class="card asset-card gda-file-card">
          <div class="asset-hit-target" @click="emit('open')">
            <RtfPreview v-if="!index && row.gdaRtf && directory.gdaProject" :file="directory.gdaProject" :name="folder.name" :revision="revision" :facts="row.gdaRtf" />
            <button v-else type="button" class="resource-preview" :aria-label="`Show the details of ${row.resource}`">
              <div class="thumbnail"><div class="generic-preview rtf"><i aria-hidden="true" :class="['mdi', typeIcons.rtf]" /></div></div>
            </button>
          </div>
          <div class="card-body">
            <p class="asset-name"><button type="button" class="resource-icon-button resource-file-copy" :aria-label="`Copy the GDA folder ${folder.path}`" title="Copy the GDA folder" @click="copy(folder.absolutePath)"><i aria-hidden="true" :class="['mdi', typeIcons.rtf]" /></button><span :title="folder.absolutePath">{{ folder.name }}</span></p>
            <p class="asset-meta"><span class="resource-folder"><button type="button" class="resource-icon-button resource-folder-open" :aria-label="`Open GDA directory ${folder.directory}`" :title="`Open ${folder.directory}`" @click="openResourceFolder(folder.absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button><span :title="folder.directory">{{ folder.directory }}</span></span><span v-if="folder.tree === 'common'">common GDA</span></p>
            <p v-if="!index && row.gdaRtf" class="resource-sequence">{{ number(row.gdaRtf.pages.length) }} page{{ plural(row.gdaRtf.pages.length) }} · {{ number(directory.files.filter(file => file.gdaPath).length) }} files</p>
            <div class="asset-footer">
              <span :class="['badge', 'resource-status', index ? 'badge-light' : 'badge-primary']">{{ index ? 'Other match' : `Copied on sync: ${rtfChangeSummary(directory)}` }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
    <section v-else-if="row.category === 'different'" class="resource-gda" :aria-label="`GDA files named ${resource.name}`">
      <div class="resource-gda-files">
        <article v-for="(file, index) in gdaFiles" :key="file.absolutePath" class="card asset-card gda-file-card">
          <button type="button" class="resource-preview" :aria-label="`Show the details of ${row.resource}`" @click="emit('open')">
            <ReportThumbnail :file="file.absolutePath" :name="file.name" :revision="revision" />
          </button>
          <div class="card-body">
            <p class="asset-name"><button type="button" class="resource-icon-button resource-file-copy" :aria-label="`Copy the GDA path ${file.path}`" title="Copy the GDA path" @click="copy(file.absolutePath)"><i aria-hidden="true" :class="['mdi', icon(file.name)]" /></button><span :title="file.absolutePath">{{ file.name }}</span></p>
            <p class="asset-meta"><span class="resource-folder"><button type="button" class="resource-icon-button resource-folder-open" :aria-label="`Open GDA directory ${file.directory}`" :title="`Open ${file.directory}`" @click="openResourceFolder(file.absolutePath)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button><span :title="file.directory">{{ file.directory }}</span></span><span v-if="file.tree === 'common'">common GDA</span></p>
            <p v-if="file.match" class="resource-sequence resource-match" :title="algorithmTitle(file.match)">{{ matchText(file.match) }}</p>
            <div class="asset-footer">
              <span :class="['badge', 'resource-status', index ? 'badge-light' : 'badge-primary']">{{ index ? 'Other match' : 'Copied on sync' }}</span>
            </div>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.resource-card { width: 100%; }
.resource-game { position: relative; display: flex; flex-direction: column; min-width: 0; }
.resource-preview { display: block; width: 100%; padding: 0; border: 0; background: transparent; text-align: left; cursor: pointer; }
.asset-hit-target { cursor: pointer; }
.resource-preview:focus-visible { outline-offset: -2px; }
.resource-folder { display: inline-flex; align-items: flex-start; gap: 4px; min-width: 0; }
.resource-folder i { flex-shrink: 0; font-size: 14px; line-height: 1; }
.resource-folder > span { margin-right: 0; white-space: normal; overflow-wrap: anywhere; }
.resource-card.is-different { display: grid; grid-template-columns: minmax(0, 1fr) 100px minmax(0, 1fr); align-items: start; gap: 12px; max-width: 724px; }
.resource-status { max-width: 100%; white-space: normal; text-align: left; line-height: 1.3; overflow-wrap: anywhere; }
.resource-declared { display: flex; flex-direction: column; gap: 2px; margin-top: 10px; font-size: 11px; overflow-wrap: anywhere; }
.resource-declared span { font-family: monospace; }
.resource-declaration { display: flex; align-items: flex-start; gap: 4px; }
.resource-declaration > span { min-width: 0; }
.resource-declaration .resource-declaration-open { flex-shrink: 0; width: 20px; height: 20px; font-size: 14px; }
.resource-sequence { margin: -4px 0 10px; color: #8a939c; font-size: 11px; }
.resource-sequence-id { display: block; color: #6b7280; font-family: monospace; overflow-wrap: anywhere; }
.resource-sequence-id.is-guessed { font-family: inherit; font-style: italic; }
.resource-frames { padding: 0 1.15rem 10px; font-size: 11px; }
.resource-frames summary { color: #6c757d; cursor: pointer; }
.resource-frames ul { max-height: 160px; margin: 6px 0 0; padding: 0; overflow-y: auto; list-style: none; }
.resource-frames li { display: flex; justify-content: space-between; gap: 8px; padding: 2px 0; font-family: monospace; font-size: 11px; line-height: 1.4; overflow-wrap: anywhere; }
.resource-frames small { flex-shrink: 0; color: #8a939c; font-family: inherit; }
.resource-icon-button { display: flex; align-items: center; justify-content: center; width: 30px; height: 30px; padding: 0; border: 0; border-radius: 6px; background: transparent; color: #6b7280; font-size: 16px; cursor: pointer; }
.resource-icon-button:hover { background: #ebedf2; color: #4b49ac; }
.resource-file-copy { flex-shrink: 0; width: 20px; height: 20px; margin-right: 4px; color: #2196f3; }
.resource-folder-open { flex-shrink: 0; width: 20px; height: 20px; }
.resource-folder-open i { margin: 0; }
.asset-name .resource-file-copy i { margin-right: 0; }
.resource-gda { min-width: 0; }
.resource-operation { display: flex; align-self: center; align-items: center; justify-content: center; margin: 0; }
.resource-copy-button { display: flex; align-items: center; justify-content: center; width: 56px; height: 48px; padding: 6px; border: 1px solid #c5def3; border-radius: 10px; background: #fff; box-shadow: 0 3px 10px rgba(33, 150, 243, 0.1); cursor: pointer; transition: background 0.15s, border-color 0.15s; }
.resource-copy-button:hover:not(:disabled) { background: #edf7ff; border-color: #2196f3; }
.resource-copy-button:disabled { opacity: 0.4; cursor: default; }
.resource-copy-icon { display: block; width: 36px; height: 36px; object-fit: contain; }
.resource-gda-files { display: grid; gap: 16px; }
/* An image and its GDA images: cards of one width in one row, all as tall as the tallest. Only the GDA images scroll
   sideways, right of the copy arrow; the game image's card has the scroll area's padding as its margins, and leaves room
   for its scroll bar below it. */
.resource-card.is-matching { --card-width: 300px; display: flex; align-items: stretch; max-width: none; }
.resource-card.is-matching > .resource-game { flex: none; width: var(--card-width); margin: 3px 0 calc(6px + var(--strip-gutter, 0px)); }
.resource-card.is-matching > .resource-operation { flex: none; width: 104px; flex-direction: column; gap: 6px; align-self: stretch; }
.resource-operation-hint { color: #6c757d; font-size: 11px; line-height: 1.3; text-align: center; overflow-wrap: anywhere; }
.resource-candidates { display: flex; flex: 1 1 auto; min-width: 0; align-items: stretch; gap: 12px; padding: 3px 3px 6px; overflow-x: auto; }
.resource-candidate { flex: none; width: var(--card-width); margin: 0; }
/* The choose button covers its whole card; the folder button stays above it. */
.resource-candidate-select { display: block; width: 100%; padding: 0; border: 0; border-radius: inherit; background: transparent; color: inherit; text-align: left; cursor: pointer; }
.resource-candidate-select::after { content: ""; position: absolute; inset: 0; z-index: 1; border-radius: inherit; }
.resource-candidate-select:disabled { cursor: default; }
.resource-candidate-select:focus-visible { outline: none; }
.resource-candidate-select:focus-visible::after { outline: 2px solid #2196f3; outline-offset: -2px; }
.resource-candidate .resource-folder-open { position: relative; z-index: 2; }
.resource-candidate:not(.is-unsyncable):not(.chosen):hover { box-shadow: 0 0 0 1px #90caf9; }
.resource-candidate.is-unsyncable .thumbnail { opacity: 0.6; }
.resource-candidate-name { display: flex; align-items: flex-start; gap: 4px; padding: 10px 12px 0; font-size: 13px; font-weight: 500; overflow-wrap: anywhere; }
.resource-candidate-name i { color: #2196f3; }
.resource-candidate-match { display: block; padding: 2px 12px 0; color: #6c757d; font-size: 11px; }
.resource-candidate-body { padding-top: 6px; }
.gda-file-card { min-width: 0; }
.resource-card :deep(.thumbnail img) { object-fit: contain; }
@media (max-width: 767px) {
  .resource-card.is-different { grid-template-columns: minmax(0, 1fr); max-width: none; }
  /* On a phone the GDA images go below the game image, which keeps their width. */
  .resource-card.is-matching { --card-width: min(300px, 100%); flex-direction: column; }
  .resource-card.is-matching > .resource-game { margin: 0; }
  .resource-card.is-matching > .resource-operation { width: auto; padding: 4px 0; }
  .resource-candidates { flex: none; }
  .resource-copy-icon { transform: rotate(90deg); }
}
</style>
