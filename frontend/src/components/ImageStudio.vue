<script setup lang="ts">
import { computed, nextTick, onActivated, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ReportAsset } from '../types';
import { baseName, extensionOf, reportPreviewURL, time } from '../format';
import { studioAPI, generatedURL, jobGeneratedURL, studioThumbnailURL, type ImageJobs, type ImageMetadata, type ImageSettings, type MetadataDocument, type StudioCatalog, type StudioFile } from '../imageStudio';
import AppModal from './AppModal.vue';
import ImageStudioBrowser from './ImageStudioBrowser.vue';
import ImageStudioQueue from './ImageStudioQueue.vue';
import StudioSequencePlayer from './StudioSequencePlayer.vue';
import { vAutoSize } from '../directives/autoSize';
import { notify, registerNavigationGuard, ui } from '../workspace';

const props = defineProps<{ row?: ReportAsset; stacked?: boolean; embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const tab = ref<'metadata' | 'queue' | 'models' | 'remote'>('metadata');
const catalog = ref<StudioCatalog | null>(null);
const document = ref<MetadataDocument | null>(null);
const selected = ref('');
// The images selected in the asset list. One opens in the editor; several show as thumbnails and are described or
// generated together.
const selection = ref<string[]>([]);
const error = ref('');
const message = ref('');
const working = ref(false);
const loading = ref(false);
const jobs = ref<ImageJobs>({ jobs: [], queued: 0, running: false });
const settings = ref<ImageSettings | null>(null);
const original = ref('');
const settingsOriginal = ref('');
const creating = ref(false);
const newPath = ref('art/generated/new-image.png');
const overwriteGenerated = ref(false);
const preview = ref<'source' | 'generated' | 'comparison'>('source');
const previewJob = ref('');
const showMetadataFile = ref(false);
// Describe asks before it replaces an image's saved metadata file.
const confirmingDescribe = ref(false);
const inspectorMode = ref<'describe' | 'generate'>('describe');
const tags = ref('');
const objects = ref('');
const prompt = ref('');
const previewFailed = ref<string[]>([]);
const studioBody = ref<HTMLElement>();
const scrollPositions = new WeakMap<HTMLElement, { top: number; left: number }>();
let pageScroll = { top: 0, left: 0 };
function rememberPageScroll() {
  if (props.embedded && ui.view === 'imageStudio') pageScroll = { top: window.scrollY, left: window.scrollX };
}
function rememberScroll(event: Event) {
  if (studioBody.value?.isConnected && event.target instanceof HTMLElement) {
    scrollPositions.set(event.target, { top: event.target.scrollTop, left: event.target.scrollLeft });
  }
}
onActivated(async () => {
  await nextTick();
  if (!studioBody.value?.isConnected) return;
  for (const element of [studioBody.value, ...studioBody.value.querySelectorAll<HTMLElement>('*')]) {
    const position = scrollPositions.get(element);
    if (position) { element.scrollTop = position.top; element.scrollLeft = position.left; }
  }
  if (props.embedded) window.scrollTo(pageScroll.left, pageScroll.top);
});
onMounted(() => { if (props.embedded) window.addEventListener('scroll', rememberPageScroll, { passive: true }); });
onBeforeUnmount(() => window.removeEventListener('scroll', rememberPageScroll));
const dirty = computed(() => !!document.value && JSON.stringify([document.value.metadata, tags.value, objects.value, prompt.value]) !== original.value);
const modelsDirty = computed(() => !!settings.value && JSON.stringify(settings.value.settings) !== settingsOriginal.value);
const current = computed(() => catalog.value?.files.find(file => file.file === selected.value));
const multiple = computed(() => selection.value.length > 1);
// In the asset list's order, whatever order they were selected in.
const selectedFiles = computed(() => {
  const chosen = new Set(selection.value);
  return (catalog.value?.files ?? []).filter(file => chosen.has(file.file));
});
const describable = computed(() => selectedFiles.value.filter(file => file.exists));
const described = computed(() => describable.value.filter(file => file.metadata));
const generatable = computed(() => selectedFiles.value.filter(file => file.metadata));
const selectedName = (file: StudioFile) => file.kind === 'sequence' ? file.name : baseName(file.path);
const metadata = computed(() => document.value?.metadata);
const isSequence = computed(() => document.value?.kind === 'sequence');
const imageFormat = computed(() => extensionOf(metadata.value?.sequence?.frames[0]?.path ?? document.value?.file ?? '').toUpperCase());
const imageTitle = computed(() => creating.value ? 'Create a new image' : isSequence.value
  ? baseName(metadata.value?.sequence?.paths[0] ?? current.value?.name ?? 'Animation') : baseName(document.value?.file ?? ''));
const fallbackPrompt = computed(() => [metadata.value?.analysis.description, metadata.value?.analysis.scene].filter(Boolean).join('\n'));
const copyablePrompt = computed(() => prompt.value.trim() ? prompt.value : fallbackPrompt.value);
const activeJobs = computed(() => jobs.value.jobs.filter(job => ['queued', 'running', 'cancelling'].includes(job.state)));
const sourcePreviewURL = computed(() => !document.value ? '' : isSequence.value
    ? `/api/image-studio/sequence-preview?${new URLSearchParams({ file: document.value.file, revision: document.value.revision })}`
    : reportPreviewURL(document.value.file, document.value.revision));
const generatedPreviewURL = computed(() => !document.value ? '' : previewJob.value
  ? jobGeneratedURL(previewJob.value, lastFinished.value) : generatedURL(document.value.file, lastFinished.value));
const previewURL = computed(() => preview.value === 'generated' ? generatedPreviewURL.value : sourcePreviewURL.value);
const comparisonPreviews = computed(() => [
  { key: 'source', alt: isSequence.value ? 'Representative animation frames' : 'Source image', url: sourcePreviewURL.value },
  { key: 'generated', alt: 'Generated image', url: generatedPreviewURL.value },
]);
const lastFinished = computed(() => jobs.value.jobs.flatMap(job => job.finishedAt ? [job.finishedAt] : []).sort().pop() ?? '');
const previewedJob = computed(() => jobs.value.jobs.find(job => job.id === previewJob.value));
const previewOutput = computed(() => previewedJob.value?.result ?? document.value?.generated);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let loadId = 0;

function clearMessages() { error.value = ''; message.value = ''; }
async function copyDescription() {
  const text = metadata.value?.analysis.description ?? '';
  if (!text.trim()) return;
  try {
    await navigator.clipboard.writeText(text);
    notify('Description copied to clipboard.');
  } catch { notify('Clipboard access is unavailable in this browser.', true); }
}
async function copyGenerationPrompt() {
  if (!copyablePrompt.value.trim()) return;
  try {
    await navigator.clipboard.writeText(copyablePrompt.value);
    notify('Generation prompt copied to clipboard.');
  } catch { notify('Clipboard access is unavailable in this browser.', true); }
}
function scaledRenderSize(factor: number) {
  if (!metadata.value) return null;
  const { width, height } = metadata.value.image;
  if (![width, height].every(value => Number.isInteger(value) && value > 0)) return null;
  const scaled = { width: Math.ceil(width * factor / 32) * 32, height: Math.ceil(height * factor / 32) * 32 };
  return scaled.width <= 16384 && scaled.height <= 16384 && scaled.width * scaled.height <= 64 * 1024 * 1024 ? scaled : null;
}
function setRenderScale(factor: number) {
  const scaled = scaledRenderSize(factor);
  if (metadata.value && scaled) Object.assign(metadata.value.generation, scaled);
}
function guardDiscard() { return !dirty.value || window.confirm('Discard unsaved metadata changes?'); }
// Puts the editor back to the saved metadata, so the description replaces it when Describe finishes.
function discardEdits() {
  if (!document.value) return;
  const [value, savedTags, savedObjects, savedPrompt] = JSON.parse(original.value) as [ImageMetadata, string, string, string];
  document.value = { ...document.value, metadata: value };
  tags.value = savedTags;
  objects.value = savedObjects;
  prompt.value = savedPrompt;
}
function canLeave() {
  return !working.value && guardDiscard() && (!modelsDirty.value || window.confirm('Discard unsaved model settings?'));
}
const unregisterGuard = props.embedded ? registerNavigationGuard(view =>
  view !== undefined ? !working.value : canLeave()) : undefined;
function close() {
  if (!canLeave()) return;
  emit('close');
}
function markClean(value: MetadataDocument) {
  document.value = value;
  tags.value = value.metadata.analysis.tags.join(', ');
  objects.value = value.metadata.analysis.objects.join(', ');
  prompt.value = value.metadata.generation.prompt ?? '';
  original.value = JSON.stringify([value.metadata, tags.value, objects.value, prompt.value]);
}
async function loadCatalog() {
  catalog.value = await studioAPI<StudioCatalog>(`catalog${props.row ? `?asset=${encodeURIComponent(props.row.id)}` : ''}`);
  const files = new Set(catalog.value.files.map(file => file.file));
  if (selection.value.every(file => files.has(file))) return;
  selection.value = selection.value.filter(file => files.has(file));
  if (selection.value.length === 1 && selection.value[0] !== selected.value) void selectFile(selection.value[0], false);
}
async function selectFile(file: string, discard = true) {
  if (discard && !guardDiscard()) return false;
  clearMessages();
  const request = ++loadId;
  selected.value = file;
  // Opening an image selects it alone.
  if (discard) selection.value = [file];
  loading.value = true;
  try {
    const value = await studioAPI<MetadataDocument>(`metadata?file=${encodeURIComponent(file)}`);
    if (request !== loadId || disposed || (!discard && dirty.value)) return false;
    selected.value = file;
    creating.value = false;
    preview.value = !discard && preview.value === 'comparison' && value.generated ? 'comparison' : value.generated ? 'generated' : 'source';
    previewJob.value = '';
    previewFailed.value = [];
    markClean(value);
    return true;
  } catch (e) { error.value = (e as Error).message; return false; } finally { if (request === loadId) loading.value = false; }
}
async function changeSelection(files: string[]) {
  if (files.length === 1) {
    // Selecting the image open in the editor again keeps its unsaved edits.
    if (files[0] === selected.value && document.value && !creating.value) selection.value = files;
    else await selectFile(files[0]);
    return;
  }
  // The editor is hidden while several images or none are selected, so its edits are not kept out of sight.
  if (!guardDiscard()) return;
  discardEdits();
  clearMessages();
  selection.value = files;
  if (files.length) return;
  loadId++;
  loading.value = false;
  selected.value = '';
  document.value = null;
}
async function viewJob(file: string, jobId?: string) {
  if (await selectFile(file)) { showMetadataFile.value = false; if (jobId) { previewJob.value = jobId; preview.value = 'generated'; } }
  tab.value = 'metadata';
}
function newMetadata() {
  if (!guardDiscard()) return;
  loadId++;
  loading.value = false;
  clearMessages();
  creating.value = true;
  showMetadataFile.value = false;
  selected.value = '';
  selection.value = [];
  const metadata: ImageMetadata = {
    schema_version: 1, image: { filename: 'new-image.png', width: 1024, height: 1024, transparency: false },
    generation: { width: 1024, height: 1024 }, model: 'manual', created_at: new Date().toISOString(),
    analysis: { description: '', scene: '', objects: [], tags: [], text: '' },
  };
  markClean({ file: '', path: '', exists: false, revision: '', metadata, generated: null });
  preview.value = 'source';
  previewJob.value = '';
}
async function save(): Promise<boolean> {
  if (!document.value || !metadata.value) return false;
  clearMessages();
  working.value = true;
  try {
    const value = JSON.parse(JSON.stringify(metadata.value)) as ImageMetadata;
    value.analysis.tags = tags.value.split(',').map(tag => tag.trim()).filter(Boolean);
    value.analysis.objects = objects.value.split(',').map(tag => tag.trim()).filter(Boolean);
    if (prompt.value.trim()) value.generation.prompt = prompt.value.trim();
    else delete value.generation.prompt;
    const file = creating.value ? newPath.value : document.value.file;
    if (creating.value) value.image.filename = baseName(file);
    const saved = await studioAPI<MetadataDocument>('metadata', { file, metadata: value, revision: document.value.revision });
    selected.value = saved.file;
    selection.value = [saved.file];
    creating.value = false;
    markClean(saved);
    await loadCatalog();
    message.value = 'Metadata saved.';
    return true;
  } catch (e) { error.value = (e as Error).message; return false; } finally { working.value = false; }
}
async function enqueue(kind: 'metadata' | 'image', batch?: string[], replace = kind === 'image' && overwriteGenerated.value) {
  if (!batch && kind === 'image' && (dirty.value || creating.value || !document.value?.exists) && !await save()) return;
  if (kind === 'metadata' && !batch && !guardDiscard()) return;
  clearMessages();
  working.value = true;
  try {
    const body = batch ? { kind, files: batch, overwrite: replace }
      : { kind, files: [document.value?.file], overwrite: replace };
    jobs.value = await studioAPI<ImageJobs>('jobs', body);
    message.value = `${jobs.value.submitted?.length ?? 0} job(s) submitted. ${kind === 'image'
      ? `Existing results with the same settings are ${replace ? 'replaced after success' : 'kept'}.`
      : 'Metadata is saved after successful description.'}`;
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
// Several selected images are queued one job each, in the asset list's order.
function describe() {
  if (multiple.value ? described.value.length : document.value?.exists) confirmingDescribe.value = true;
  else void enqueue('metadata', multiple.value ? describable.value.map(file => file.file) : undefined);
}
async function confirmDescribe(replace = true) {
  confirmingDescribe.value = false;
  if (multiple.value) {
    await enqueue('metadata', describable.value.filter(file => replace || !file.metadata).map(file => file.file), replace);
    return;
  }
  discardEdits();
  await enqueue('metadata', undefined, true);
}
// The metadata files are in the app-data folder, which the resource folder actions do not open.
async function openMetadata(action: 'open-folder' | 'open-metadata') {
  if (!document.value?.exists) return;
  try {
    await studioAPI(action, { file: document.value.file });
    notify(action === 'open-folder' ? 'Opened folder.' : 'Opened metadata file in VS Code.');
  } catch (e) { notify((e as Error).message, true); }
}
async function retry(id: string, force = false) {
  clearMessages();
  working.value = true;
  try {
    jobs.value = await studioAPI<ImageJobs>('jobs/retry', { id, force });
    message.value = force ? "Regeneration submitted using this job's saved configuration. Existing output will be replaced after success."
      : 'Retry submitted using saved inputs and the latest model settings.';
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
async function cancel(id: string) {
  try { jobs.value = await studioAPI<ImageJobs>('jobs/cancel', { id }); }
  catch (e) { error.value = (e as Error).message; }
}
async function cancelAll() {
  clearMessages();
  working.value = true;
  try {
    jobs.value = await studioAPI<ImageJobs>('jobs/cancel-all', {});
    message.value = 'Cancellation requested for all active jobs in this workspace.';
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
async function cleanQueue() {
  clearMessages();
  working.value = true;
  try {
    jobs.value = await studioAPI<ImageJobs>('jobs/clean', {});
    message.value = 'Finished jobs cleared from this workspace’s queue. Images and saved configurations kept.';
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
async function pollJobs() {
  try {
    const value = await studioAPI<ImageJobs>('jobs');
    const changed = value.jobs.some(job => job.finishedAt && !jobs.value.jobs.some(old => old.id === job.id && old.finishedAt === job.finishedAt));
    jobs.value = value;
    if (changed) {
      await loadCatalog();
      if (document.value && !loading.value && selected.value === document.value.file && !dirty.value && !creating.value) {
        const jobId = previewJob.value;
        if (await selectFile(document.value.file, false) && value.jobs.some(job => job.id === jobId && job.state === 'succeeded')) previewJob.value = jobId;
      }
    }
  } catch (e) { error.value = (e as Error).message; }
  finally { if (!disposed) timer = setTimeout(pollJobs, 1200); }
}
async function saveModels() {
  if (!settings.value) return;
  clearMessages();
  working.value = true;
  try {
    settings.value = await studioAPI<ImageSettings>('settings', { settings: settings.value.settings });
    settingsOriginal.value = JSON.stringify(settings.value.settings);
    message.value = 'Model settings saved. New jobs will use these settings.';
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
onMounted(async () => {
  try {
    await loadCatalog();
    settings.value = await studioAPI<ImageSettings>('settings');
    settingsOriginal.value = JSON.stringify(settings.value.settings);
    const [first] = catalog.value?.files ?? [];
    if (!document.value && !selected.value && !selection.value.length && first) {
      selection.value = [first.file];
      await selectFile(first.file, false);
    }
  } catch (e) { error.value = (e as Error).message; }
  if (!disposed) void pollJobs();
});
onBeforeUnmount(() => { disposed = true; loadId++; clearTimeout(timer); unregisterGuard?.(); });
</script>

<template>
  <component :is="embedded ? 'section' : AppModal" v-bind="embedded ? { class: 'card studio-page', 'aria-label': 'Image studio' } : { title: 'Image studio', xl: true, stacked, dialogClass: 'image-studio' }" @close="close">
    <div class="studio-tabs" role="tablist" aria-label="Image studio sections">
      <button v-for="item in (['metadata', 'queue', 'models', 'remote'] as const)" :key="item" type="button" role="tab"
              :aria-selected="tab === item" :class="{ active: tab === item }" @click="tab = item">
        <i aria-hidden="true" :class="['mdi', item === 'metadata' ? 'mdi-image-edit-outline' : item === 'queue' ? 'mdi-format-list-bulleted' : 'mdi-tune']" />
        {{ item === 'metadata' ? 'Metadata' : item === 'queue' ? 'Generation queue' : item === 'models' ? 'Local models' : 'Remote models' }}
        <span v-if="item === 'queue' && activeJobs.length" class="badge badge-light">{{ activeJobs.length }}</span>
      </button>
    </div>
    <div ref="studioBody" class="studio-body" :class="{ 'modal-body': !embedded }" @scroll.capture="rememberScroll">
      <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
      <p v-if="message" class="alert alert-info" role="status">{{ message }}</p>
      <ImageStudioBrowser v-show="tab === 'metadata'" :class="{ 'fill-height': embedded }" :files="catalog?.files ?? []" :selection="selection" :working="working" :game="catalog?.game ?? ''" :revision="lastFinished"
                            v-slot="{ destinationFolder }" @select="changeSelection" @create="newMetadata">
          <section class="studio-editor" :aria-label="multiple ? 'Selected images' : 'Image metadata editor'" :aria-busy="!multiple && loading">
            <div v-if="multiple" class="studio-workbench">
              <div class="studio-preview-column">
                <div class="studio-editor-heading">
                  <div><h6>{{ selectedFiles.length }} images selected</h6></div>
                  <div class="studio-image-facts"><span>{{ generatable.length }} with metadata</span><span v-if="selectedFiles.length > describable.length">{{ selectedFiles.length - describable.length }} without an image</span></div>
                </div>
                <ul class="studio-selection-grid" aria-label="Selected images">
                  <li v-for="file in selectedFiles" :key="file.file">
                    <button type="button" class="studio-selection-item" :title="`${file.path}\nClick to select only this image`" :aria-label="`Select only ${file.name}`" :disabled="working" @click="changeSelection([file.file])">
                      <span class="studio-selection-thumbnail"><img v-if="file.exists && !previewFailed.includes(file.file)" :src="studioThumbnailURL(file, catalog?.game ?? '', lastFinished)" alt="" loading="lazy" @error="previewFailed.push(file.file)"><i v-else aria-hidden="true" :class="['mdi', file.kind === 'sequence' ? 'mdi-animation-outline' : 'mdi-image-off-outline']" /></span>
                      <span class="studio-selection-label"><strong>{{ selectedName(file) }}</strong><small>{{ file.metadata ? 'Metadata saved' : 'No metadata' }}{{ file.exists ? '' : ' · No image' }}</small></span>
                    </button>
                  </li>
                </ul>
              </div>
              <div class="studio-inspector">
                <div class="studio-inspector-modes" role="group" aria-label="Image inspector">
                  <button type="button" :class="{ active: inspectorMode === 'describe' }" :aria-pressed="inspectorMode === 'describe'" @click="inspectorMode = 'describe'">Describe</button>
                  <button type="button" :class="{ active: inspectorMode === 'generate' }" :aria-pressed="inspectorMode === 'generate'" @click="inspectorMode = 'generate'">Generate</button>
                </div>
                <p v-if="inspectorMode === 'describe'" class="studio-hint">Describe queues one job for each selected image, in the order of the asset list. {{ describable.length < selectedFiles.length ? 'Images that do not exist are left out.' : '' }} {{ described.length ? 'You are asked before metadata files are replaced.' : '' }}</p>
                <p v-else class="studio-hint">Generate queues one image for each selected image with saved metadata, using its saved prompt and sizes. {{ generatable.length < selectedFiles.length ? 'Images without metadata are left out.' : '' }}</p>
                <div class="studio-inspector-actions">
                  <button v-if="inspectorMode === 'describe'" type="button" class="btn btn-primary" :disabled="working || !describable.length" title="Describe each selected image with the vision model and save its metadata after success" @click="describe"><i aria-hidden="true" class="mdi mdi-auto-fix" /> Describe <span class="badge badge-light">{{ describable.length }}</span></button>
                  <button v-else type="button" class="btn btn-primary" :disabled="working || !generatable.length" @click="enqueue('image', generatable.map(file => file.file))">Generate images <span class="badge badge-light">{{ generatable.length }}</span></button>
                </div>
              </div>
            </div>
            <template v-else>
            <p v-if="loading" class="studio-loading" role="status">Loading metadata…</p>
            <p v-if="!loading && !metadata" class="text-muted">Choose an image, or create metadata for a new image.</p>
            <form v-if="metadata" :inert="loading" @submit.prevent="save">
              <p v-if="document?.sourceError" class="alert alert-warning">{{ document.sourceError }}</p>
              <div class="studio-workbench">
                <div class="studio-preview-column">
                  <div class="studio-editor-heading">
                    <div><h6 :title="imageTitle">{{ imageTitle }}</h6><span v-if="dirty" class="studio-hint">Unsaved changes</span></div>
                    <div class="studio-image-facts"><span v-if="imageFormat">{{ imageFormat }}</span><span>{{ metadata.image.width }} × {{ metadata.image.height }}</span><template v-if="isSequence && metadata.sequence"><span>{{ metadata.sequence.frames.length }} frames</span><span>{{ metadata.sequence.frameTime }} ms/frame</span></template></div>
                  </div>

                  <div class="studio-preview-content">
                    <section v-if="showMetadataFile" class="studio-provenance" aria-label="Metadata file">
                      <dl>
                        <dt>JSON file</dt>
                        <dd class="studio-metadata-file">
                          <span>{{ document?.path || 'Created in the app-data folder when you save the metadata' }}</span>
                          <span class="studio-file-actions">
                            <button type="button" class="details-icon" aria-label="Open metadata folder" :title="document?.exists && !creating ? 'Open metadata folder' : 'Save metadata first'" :disabled="working || loading || creating || !document?.exists" @click="openMetadata('open-folder')"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
                            <button type="button" class="details-icon" aria-label="Open metadata file in VS Code" :title="document?.exists && !creating ? 'Open metadata file in VS Code' : 'Save metadata first'" :disabled="working || loading || creating || !document?.exists" @click="openMetadata('open-metadata')"><i aria-hidden="true" class="mdi mdi-code-braces" /></button>
                          </span>
                        </dd>
                        <dt>Model</dt><dd>{{ metadata.model }}</dd>
                        <dt>Created</dt><dd>{{ time(metadata.created_at) }}</dd>
                        <dt v-if="metadata.image.sha256">Source SHA-256</dt><dd v-if="metadata.image.sha256">{{ metadata.image.sha256 }}</dd>
                      </dl>
                      <pre>{{ JSON.stringify(metadata, null, 2) }}</pre>
                    </section>
                    <template v-else>
                      <div v-if="!creating && (current?.exists || document?.generated)" :class="['studio-preview', { 'is-sequence': isSequence && preview === 'source' }]">
                        <div v-if="document?.generated" class="studio-preview-tabs">
                          <div class="studio-preview-modes" role="tablist" aria-label="Image preview">
                            <button v-if="current?.exists" type="button" role="tab" :aria-selected="preview === 'source'" :class="{ active: preview === 'source' }" @click="preview = 'source'; previewFailed = []">{{ isSequence ? 'Animation frames' : 'Source image' }}</button>
                            <button v-if="document?.generated" type="button" role="tab" :aria-selected="preview === 'generated'" :class="{ active: preview === 'generated' }" @click="preview = 'generated'; previewFailed = []">Generated image</button>
                            <button v-if="current?.exists && document?.generated" type="button" role="tab" :aria-selected="preview === 'comparison'" :class="{ active: preview === 'comparison' }" @click="preview = 'comparison'; previewFailed = []">Side by side</button>
                          </div>
                          <a v-if="preview !== 'source'" :href="generatedPreviewURL" target="_blank" rel="noopener">Open PNG <i aria-hidden="true" class="mdi mdi-open-in-new" /></a>
                        </div>
                        <div v-if="preview === 'comparison'" class="studio-preview-comparison" role="tabpanel" aria-label="Side by side">
                          <figure v-for="pane in comparisonPreviews" :key="pane.key">
                            <div class="studio-image"><img v-if="!previewFailed.includes(pane.url)" :src="pane.url" :alt="pane.alt" @error="previewFailed.push(pane.url)"><span v-else class="text-muted">Preview unavailable</span></div>
                          </figure>
                        </div>
                        <StudioSequencePlayer v-else-if="preview === 'source' && isSequence && metadata.sequence" :sequence="metadata.sequence" :game="catalog?.game ?? ''" :revision="document?.revision ?? ''" />
                        <div v-else class="studio-image"><img v-if="!previewFailed.includes(previewURL)" :src="previewURL" :alt="preview === 'source' ? isSequence ? 'Representative animation frames' : 'Source image' : 'Generated image'" @error="previewFailed.push(previewURL)"><span v-else class="text-muted">Preview unavailable</span></div>

                        <p v-if="preview !== 'source'" class="studio-output-path">{{ previewOutput }}<small v-if="previewedJob?.renderSize">Saved render resolution: {{ previewedJob.renderSize.width }} × {{ previewedJob.renderSize.height }}</small><small>The latest generated image is also available beside the metadata file.</small></p>
                      </div>
                      <div v-else class="studio-preview-placeholder">
                        <i aria-hidden="true" :class="['mdi', creating ? 'mdi-image-plus-outline' : 'mdi-image-off-outline']" />
                        <h6>{{ creating ? 'New image' : 'No image preview' }}</h6>
                        <p v-if="creating" class="studio-hint">Describe the image in the inspector.</p>
                      </div>
                      <div v-if="creating" class="studio-destination-preview">
                        <span class="studio-hint">New image destination · preview</span>
                        <p><i aria-hidden="true" class="mdi mdi-folder-outline" /> {{ destinationFolder || 'Choose a folder with Select folder' }}</p>
                        <small>Destination preview only. Saving still uses the Image path field.</small>
                      </div>
                      <details v-if="isSequence && metadata.sequence" class="studio-animation-info"><summary>Animation details</summary><p>One description covers the animation’s appearance and motion. Describe samples up to 12 frames across the full animation. Generating an image creates a single still from the shared prompt.</p></details>
                    </template>
                  </div>
                  <button type="button" class="btn btn-outline-primary btn-sm studio-preview-toggle" :aria-label="showMetadataFile ? 'Show image preview' : 'Show metadata file'" :aria-pressed="showMetadataFile" @click="showMetadataFile = !showMetadataFile"><i aria-hidden="true" :class="['mdi', showMetadataFile ? 'mdi-image-outline' : 'mdi-code-json']" /> {{ showMetadataFile ? 'Image preview' : 'Metadata file' }}</button>
                </div>
                <div class="studio-inspector">
                  <div class="studio-inspector-modes" role="group" aria-label="Image inspector">
                    <button type="button" :class="{ active: inspectorMode === 'describe' }" :aria-pressed="inspectorMode === 'describe'" @click="inspectorMode = 'describe'">Describe</button>
                    <button type="button" :class="{ active: inspectorMode === 'generate' }" :aria-pressed="inspectorMode === 'generate'" @click="inspectorMode = 'generate'">Generate</button>
                  </div>
                  <label v-if="creating" class="studio-field">Image path <textarea v-auto-size v-model="newPath" rows="1" aria-label="Image path" class="form-control" required placeholder="art/generated/new-image.png" @keydown.enter.prevent /><small>Relative to the game folder. Its metadata file is kept in the app-data folder, not in the game.</small></label>
                  <div v-show="inspectorMode === 'describe'">

                    <div class="studio-field">
                      <div class="studio-field-heading"><span>Description</span><button type="button" class="details-icon" aria-label="Copy description" title="Copy description" :disabled="!metadata.analysis.description.trim()" @click="copyDescription"><i aria-hidden="true" class="mdi mdi-content-copy" /></button></div>
                      <textarea v-auto-size v-model="metadata.analysis.description" aria-label="Description" rows="2" class="form-control" placeholder="Describe the image you want to create…" />
                    </div>
                    <label class="studio-field">Scene<textarea v-auto-size v-model="metadata.analysis.scene" rows="2" class="form-control" placeholder="Setting, background and lighting" /></label>
                    <div class="studio-description-tools">
                    <details class="studio-inspector-details">
                      <summary>More metadata</summary>
                      <div class="studio-dimensions"><label class="studio-field">Objects<textarea v-auto-size v-model="objects" rows="1" class="form-control" placeholder="Comma-separated objects" /></label><label class="studio-field">Tags<textarea v-auto-size v-model="tags" rows="1" class="form-control" placeholder="Comma-separated tags" /></label></div>
                      <label class="studio-field">Text in image<textarea v-auto-size v-model="metadata.analysis.text" rows="2" class="form-control" /></label>
                    </details>
                    </div>
                  </div>
                  <div v-show="inspectorMode === 'generate'">
                    <div class="studio-field">
                      <div class="studio-field-heading"><span>Generation prompt</span><button type="button" class="details-icon" aria-label="Copy generation prompt" title="Copy generation prompt" :disabled="!copyablePrompt.trim()" @click="copyGenerationPrompt"><i aria-hidden="true" class="mdi mdi-content-copy" /></button></div>
                      <textarea v-auto-size v-model="prompt" aria-label="Generation prompt" rows="4" class="form-control" :placeholder="fallbackPrompt || 'Use the description and scene, or enter a custom prompt'" />
                      <small>Leave empty to use the description and scene. Transparency instructions are added automatically.</small>
                    </div>
                    <details class="studio-inspector-details" open>
                      <summary>Resolution &amp; background</summary>
                      <div class="studio-dimensions">
                        <fieldset><legend>Output resolution</legend><div class="studio-size"><label>Width<input v-model.number="metadata.image.width" type="number" min="1" max="16384" required class="form-control"></label><span>×</span><label>Height<input v-model.number="metadata.image.height" type="number" min="1" max="16384" required class="form-control"></label></div></fieldset>
                        <fieldset>
                          <legend>Model render resolution</legend>
                          <div class="studio-size"><label>Render width<input v-model.number="metadata.generation.width" type="number" min="32" max="16384" step="32" required class="form-control"></label><span>×</span><label>Render height<input v-model.number="metadata.generation.height" type="number" min="32" max="16384" step="32" required class="form-control"></label></div>
                          <div class="studio-render-scales" role="group" aria-label="Render resolution multiplier">
                            <span>Scale from output</span>
                            <button v-for="factor in [1, 2, 4, 8]" :key="factor" type="button" class="btn btn-outline-primary btn-sm" :disabled="working || loading || !scaledRenderSize(factor)" :title="`Set render size to ${factor}× output resolution, rounded up to multiples of 32`" @click="setRenderScale(factor)">{{ factor }}×</button>
                          </div>
                          <small>Multiples of 32. Resized to the output resolution.</small>
                        </fieldset>
                      </div>
                      <label class="studio-check"><input v-model="metadata.image.transparency" type="checkbox"> Transparent background</label>
                    </details>
                  </div>
                  <div class="studio-inspector-actions">
                    <button v-if="inspectorMode === 'describe' && !creating && current?.exists" type="button" class="btn btn-primary" :disabled="working || loading" title="Describe the image with the vision model and save its metadata after success" @click="describe"><i aria-hidden="true" class="mdi mdi-auto-fix" /> Describe</button>
                    <button v-if="inspectorMode === 'generate' || creating || !current?.exists || dirty" type="button" :class="['btn', inspectorMode === 'describe' && (creating || !current?.exists) ? 'btn-primary' : 'btn-outline-primary']" :disabled="working || loading" @click="save"><i aria-hidden="true" class="mdi mdi-content-save-outline" /> Save metadata</button>
                    <button v-if="inspectorMode === 'generate'" type="button" class="btn btn-primary" :disabled="working || loading" @click="enqueue('image')">Generate image</button>
                  </div>
                </div>
              </div>
            </form>
            </template>
          </section>
      </ImageStudioBrowser>
      <ImageStudioQueue v-if="tab === 'queue'" :jobs="jobs" :catalog="catalog" :working="working"
        @retry="retry" @cancel="cancel" @cancel-all="cancelAll" @clean="cleanQueue" @compose="tab = 'metadata'"
        @view="viewJob" />
      <form v-else-if="tab === 'models' && settings" class="studio-models" @submit.prevent="saveModels">
        <p class="studio-hint">Configure installed weights and a local LM Studio server. Enable Remote models to use another computer for either operation. No models are downloaded. Settings are stored in {{ settings.path }}.</p>
        <fieldset><legend>Describe · LM Studio</legend>
          <label class="studio-field">API base URL<input v-model="settings.settings.analysis.base_url" class="form-control" required></label>
          <label class="studio-field">Vision model<input v-model="settings.settings.analysis.model" class="form-control" required></label>
          <div class="studio-dimensions"><label class="studio-field">Describe timeout (seconds)<input v-model.number="settings.settings.analysis.timeout" type="number" min="1" class="form-control"></label><label class="studio-field">Maximum response tokens<input v-model.number="settings.settings.analysis.max_tokens" type="number" min="1" class="form-control"></label></div>
          <label class="studio-check"><input v-model="settings.settings.analysis.load_model" type="checkbox"> Load the vision model when describing starts</label>
          <label class="studio-check"><input v-model="settings.settings.analysis.unload_others" type="checkbox"> Unload other LM Studio models when loading vision</label>
        </fieldset>
        <fieldset><legend>Image generation · stable-diffusion.cpp</legend>
          <label v-for="field in (['diffusion_model', 'text_encoder', 'vae', 'sd_cli'] as const)" :key="field" class="studio-field">{{ { diffusion_model: 'Diffusion model path', text_encoder: 'Text encoder path', vae: 'VAE path', sd_cli: 'sd-cli executable' }[field] }}<input v-model="settings.settings.generation[field]" class="form-control"></label>
          <div class="studio-dimensions"><label class="studio-field">Steps<input v-model.number="settings.settings.generation.steps" type="number" min="1" class="form-control"></label><label class="studio-field">Seed<input v-model.number="settings.settings.generation.seed" type="number" class="form-control"></label><label class="studio-field">Guidance scale<input v-model.number="settings.settings.generation.cfg_scale" type="number" min="0.1" step="0.1" class="form-control"></label><label class="studio-field">Generation timeout (seconds)<input v-model.number="settings.settings.generation.timeout" type="number" min="1" class="form-control"></label></div>
          <label class="studio-check"><input v-model="settings.settings.generation.unload_lm_studio" type="checkbox"> Release LM Studio model memory before image generation</label>
          <label class="studio-check"><input v-model="settings.settings.generation.keep_original" type="checkbox"> Also keep the PNG at the model render resolution</label>
        </fieldset>
        <button type="submit" class="btn btn-primary" :disabled="working || !modelsDirty">Save model settings</button>
      </form>
      <form v-else-if="tab === 'remote' && settings" class="studio-models" @submit.prevent="saveModels">
        <p class="studio-hint">Use LM Studio and ComfyUI on other computers. Enable either connection to use it for new jobs; otherwise the corresponding Local models settings apply. Settings are stored in {{ settings.path }}.</p>
        <fieldset><legend>Describe · Remote LM Studio</legend>
          <label class="studio-check"><input v-model="settings.settings.remote.analysis.enabled" type="checkbox"> Use remote LM Studio to describe images</label>
          <label class="studio-field">Remote LM Studio API base URL<input v-model="settings.settings.remote.analysis.base_url" aria-label="Remote LM Studio API base URL" class="form-control" type="url" required placeholder="http://your-lm-studio-host:1234/v1"><small>Enable Serve on Local Network in LM Studio on that computer. Include /v1.</small></label>
          <label class="studio-field">Remote vision model<input v-model="settings.settings.remote.analysis.model" class="form-control" required></label>
          <label class="studio-field">LM Studio API key environment variable<input v-model="settings.settings.remote.analysis.api_key_env" aria-label="LM Studio API key environment variable" class="form-control" placeholder="LM_STUDIO_REMOTE_API_KEY"><small>Optional. Set this variable on the computer running EGT GDA Sync before starting it. Leave empty for a server without authentication.</small></label>
          <div class="studio-dimensions"><label class="studio-field">Remote describe timeout (seconds)<input v-model.number="settings.settings.remote.analysis.timeout" type="number" min="1" required class="form-control"></label><label class="studio-field">Remote maximum response tokens<input v-model.number="settings.settings.remote.analysis.max_tokens" type="number" min="1" required class="form-control"></label></div>
          <label class="studio-check"><input v-model="settings.settings.remote.analysis.load_model" type="checkbox"> Load the remote vision model when describing starts</label>
          <label class="studio-check"><input v-model="settings.settings.remote.analysis.unload_others" type="checkbox"> Unload other models on the remote LM Studio server</label>
        </fieldset>
        <fieldset><legend>Image generation · Remote ComfyUI</legend>
          <label class="studio-check"><input v-model="settings.settings.remote.generation.enabled" type="checkbox"> Use remote ComfyUI for image generation</label>
          <label class="studio-field">ComfyUI server URL<input v-model="settings.settings.remote.generation.base_url" aria-label="ComfyUI server URL" class="form-control" type="url" required placeholder="http://your-comfyui-host:8188"><small>Use the reachable address of your ComfyUI server, without /v1.</small></label>
          <label class="studio-field">ComfyUI API key environment variable<input v-model="settings.settings.remote.generation.api_key_env" aria-label="ComfyUI API key environment variable" class="form-control" placeholder="COMFYUI_API_KEY"><small>Optional Bearer token for an authenticated server or proxy. Leave empty for a server without authentication.</small></label>
          <label class="studio-field">ComfyUI API workflow<textarea v-model="settings.settings.remote.generation.workflow" aria-label="ComfyUI API workflow" rows="12" class="form-control studio-workflow" :required="settings.settings.remote.generation.enabled" spellcheck="false" placeholder='Paste your Export (API) JSON here…' /><small>In ComfyUI, choose File → Export (API). Models and custom nodes must already exist on that computer. The workflow selects the generation model.</small></label>
          <div class="studio-dimensions">
            <label class="studio-field">Prompt node ID<input v-model="settings.settings.remote.generation.prompt_node" aria-label="Prompt node ID" class="form-control" required><small>Positive prompt node with a text input.</small></label>
            <label class="studio-field">Size node ID<input v-model="settings.settings.remote.generation.size_node" aria-label="Size node ID" class="form-control" required><small>Latent/image node with width and height inputs. Uses the metadata's model render resolution.</small></label>
            <label class="studio-field">Sampler node ID<input v-model="settings.settings.remote.generation.sampler_node" aria-label="Sampler node ID" class="form-control"><small>Node with steps, cfg, and seed or noise_seed inputs. Leave empty to keep the workflow's sampler settings.</small></label>
            <label class="studio-field">Output node ID<input v-model="settings.settings.remote.generation.output_node" aria-label="Output node ID" class="form-control" required><small>SaveImage or another node that returns images. The first image is downloaded.</small></label>
          </div>
          <div class="studio-dimensions">
            <label class="studio-field">ComfyUI steps<input v-model.number="settings.settings.remote.generation.steps" type="number" min="1" required class="form-control"></label>
            <label class="studio-field">ComfyUI seed<input v-model.number="settings.settings.remote.generation.seed" type="number" required class="form-control"></label>
            <label class="studio-field">ComfyUI guidance scale<input v-model.number="settings.settings.remote.generation.cfg_scale" type="number" min="0.1" step="0.1" required class="form-control"></label>
            <label class="studio-field">ComfyUI timeout (seconds)<input v-model.number="settings.settings.remote.generation.timeout" type="number" min="1" required class="form-control"></label>
          </div>
          <label class="studio-check"><input v-model="settings.settings.remote.generation.keep_original" type="checkbox"> Also keep the original ComfyUI render as a PNG</label>
          <p class="studio-hint">The downloaded image is resized to the metadata's output resolution. Transparent images require a workflow that produces alpha. Cancelling removes this job from the remote queue if pending and discards its result if already running.</p>
        </fieldset>
        <button type="submit" class="btn btn-primary" :disabled="working || !modelsDirty">Save model settings</button>
      </form>
    </div>
    <div class="studio-footer" :class="{ 'modal-footer': !embedded }">
      <label class="studio-check"><input v-model="overwriteGenerated" type="checkbox"> Replace existing generated PNGs after success</label>
      <div class="studio-footer-actions">
        <button v-if="!embedded" type="button" class="btn btn-light" :disabled="working" @click="close">Close</button>
      </div>
    </div>
    <Teleport to="body">
      <AppModal v-if="confirmingDescribe && multiple" :title="`Describe ${described.length === 1 ? 'an image' : `${described.length} images`} again?`" stacked @close="confirmingDescribe = false">
        <div class="modal-body">
          <p>{{ described.length === describable.length ? (described.length === 1 ? 'The selected image already has' : `All ${described.length} selected images already have`) : `${described.length} of the ${describable.length} selected images already ${described.length === 1 ? 'has' : 'have'}` }} a metadata file. Describing {{ described.length === 1 ? 'it' : 'them' }} again replaces {{ described.length === 1 ? 'that file' : 'those files' }} when the model finishes, including {{ described.length === 1 ? 'its generation prompt and render resolution' : 'their generation prompts and render resolutions' }}.</p>
          <ul class="studio-confirm-files">
            <li v-for="file in described.slice(0, 8)" :key="file.file">{{ file.path }}</li>
            <li v-if="described.length > 8">and {{ described.length - 8 }} more</li>
          </ul>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" @click="confirmingDescribe = false">Cancel</button>
          <button v-if="described.length < describable.length" type="button" class="btn btn-outline-primary" :disabled="working" @click="confirmDescribe(false)">Skip images with metadata</button>
          <button type="button" class="btn btn-primary" :disabled="working" @click="confirmDescribe()"><i aria-hidden="true" class="mdi mdi-auto-fix" /> Describe all</button>
        </div>
      </AppModal>
      <AppModal v-else-if="confirmingDescribe && document" :title="isSequence ? 'Describe this animation again?' : 'Describe this image again?'" stacked @close="confirmingDescribe = false">
        <div class="modal-body">
          <p><strong>{{ imageTitle }}</strong> already has a metadata file. Describing it again replaces that file when the model finishes, including its generation prompt and render resolution.</p>
          <p class="studio-hint studio-confirm-path">{{ document.path }}</p>
          <p v-if="dirty" class="text-warning mb-0"><i aria-hidden="true" class="mdi mdi-alert-outline" /> Your unsaved changes are discarded.</p>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-light" @click="confirmingDescribe = false">Cancel</button>
          <button type="button" class="btn btn-primary" :disabled="working" @click="confirmDescribe()"><i aria-hidden="true" class="mdi mdi-auto-fix" /> Describe again</button>
        </div>
      </AppModal>
    </Teleport>
  </component>
</template>

<style scoped>
:global(.image-studio .modal-content) { height: min(920px, calc(100dvh - 64px)); }
:global(.content-wrapper:has(> .studio-page)) { display: flex; flex-direction: column; }
.studio-page { flex: 1; overflow: hidden; }
.studio-page .studio-body { display: flex; flex-direction: column; flex: 1; overflow: visible; }
.studio-page .studio-editor, .studio-page .studio-editor > form { display: flex; flex-direction: column; flex: 1; }
.studio-page .studio-workbench { flex: 1; }
.studio-page .studio-preview-column, .studio-page .studio-preview-comparison figure { display: flex; flex-direction: column; }
.studio-page .studio-preview { display: flex; flex-direction: column; flex: 1; }
.studio-page .studio-image, .studio-page .studio-preview-comparison { flex: 1; }
.studio-page .studio-footer { display: flex; flex-wrap: wrap; gap: 12px; padding: 12px 14px; border-top: 1px solid #e0e4ec; background: white; position: sticky; bottom: 0; z-index: 2; }
.studio-tabs { display: flex; flex-wrap: wrap; gap: 24px; padding: 0 26px; border-bottom: 1px solid #e0e4ec; flex-shrink: 0; }
.studio-tabs button { border: 0; border-bottom: 3px solid transparent; background: none; padding: 16px 0; color: #68718a; cursor: pointer; }
.studio-tabs button.active { color: #4b49ac; border-color: #4b49ac; }
.studio-tabs .mdi { margin-right: 6px; }
.studio-body { padding: 14px; overflow-y: auto; min-height: 0; }
.studio-hint, .studio-field small, fieldset > small { font-size: 12px; color: #77809a; line-height: 1.5; }
.studio-hint { margin: 0; overflow-wrap: anywhere; }
.studio-confirm-path { margin-bottom: 12px; font-family: var(--font-family-monospace, monospace); }
.studio-confirm-files { max-height: 180px; overflow: auto; padding-left: 18px; margin: 0; font-size: 12px; color: #68718a; overflow-wrap: anywhere; }
.studio-selection-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(130px, 1fr)); align-content: start; gap: 8px; max-height: var(--studio-preview-height); overflow: auto; padding: 0; margin: 0; list-style: none; scrollbar-width: thin; }
.studio-selection-item { display: flex; flex-direction: column; gap: 6px; width: 100%; padding: 6px; text-align: left; color: #18204e; background: white; border: 1px solid #dce2f2; border-radius: 5px; cursor: pointer; }
.studio-selection-item:hover:not(:disabled) { border-color: #cfd3ff; background: #f6f7ff; }
.studio-selection-item:disabled { cursor: default; }
.studio-selection-thumbnail { display: flex; align-items: center; justify-content: center; height: 96px; overflow: hidden; border-radius: 3px; background: repeating-conic-gradient(#f1f2f7 0% 25%, white 0% 50%) 50% / 10px 10px; }
.studio-selection-thumbnail img { width: 100%; height: 100%; object-fit: contain; }
.studio-selection-thumbnail .mdi { font-size: 26px; color: #8d96b1; }
.studio-selection-label { min-width: 0; font-size: 11px; }
.studio-selection-label strong { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.studio-selection-label small { display: block; margin-top: 2px; color: #68718a; font-size: 11px; }
.studio-editor { position: relative; min-width: 0; container-type: inline-size; }
.studio-editor > p { padding: 20px; }
.studio-editor > .studio-loading { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; margin: 0; }
.studio-editor[aria-busy=true] > form { visibility: hidden; }
.studio-editor h6 { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; color: #18204e; }
.studio-editor-heading { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: 8px; padding: 0 0 8px; }
.studio-editor-heading > div:first-child { flex: 1 1 120px; min-width: 0; }
.studio-image-facts { display: flex; flex-wrap: wrap; gap: 4px; }
.studio-image-facts span { padding: 2px 5px; background: #eceeff; color: #18204e; border-radius: 4px; font-size: 11px; white-space: nowrap; }
.studio-editor-heading > .studio-hint { flex-shrink: 0; }
.studio-editor-heading .btn { flex-shrink: 0; }
.studio-workbench { display: grid; grid-template-columns: minmax(0, 1fr) 235px; gap: 12px; align-items: stretch; }
.studio-preview-column { display: flex; flex-direction: column; container-type: inline-size; --studio-preview-height: clamp(285px, calc(56.25cqw + 7px), 65vh); padding: 10px; min-width: 0; border: 1px solid #dce2f2; border-radius: 7px; box-shadow: 0 2px 5px #18204e06; }
.studio-inspector { display: flex; flex-direction: column; min-height: 350px; padding: 12px; min-width: 0; border: 1px solid #dce2f2; border-radius: 7px; box-shadow: 0 2px 5px #18204e06; }
.studio-inspector-modes { display: flex; flex-shrink: 0; border-bottom: 1px solid #e0e4ec; gap: 12px; margin-bottom: 14px; }
.studio-inspector-modes button { flex: 1; padding: 0 4px 8px; border: 0; border-bottom: 2px solid transparent; color: #18204e; background: none; cursor: pointer; font-size: 12px; }
.studio-inspector-modes button.active { color: #2336ff; border-bottom-color: #2336ff; font-weight: 600; }
.studio-inspector .studio-dimensions { grid-template-columns: minmax(0, 1fr); gap: 18px; }
.studio-inspector-details { margin: 18px 0; padding-top: 14px; border-top: 1px solid #e0e4ec; }
.studio-inspector-details > summary { cursor: pointer; font-size: 12px; color: #68718a; margin-bottom: 16px; }
.studio-inspector-actions { display: flex; flex-shrink: 0; flex-wrap: wrap; gap: 8px; margin-top: auto; padding-top: 14px; }
.studio-inspector-actions .btn { padding: 7px 10px; font-size: 12px; }
.studio-inspector-actions .btn-primary { background: #2336ff; border-color: #2336ff; }
.studio-description-tools { display: flex; align-items: flex-start; gap: 8px; border-top: 1px solid #e0e4ec; padding-top: 10px; }
.studio-description-tools .studio-inspector-details { flex: 1; margin: 0; border: 0; padding: 0; }
.studio-description-tools .studio-inspector-details > summary { margin: 0 0 10px; font-size: 11px; }
.studio-inspector-actions .btn { flex: 1 1 100%; }
.studio-preview-placeholder { min-height: 340px; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 24px; background: #f8f9fc; border: 1px dashed #dce3ed; border-radius: 6px; text-align: center; }
.studio-preview-placeholder > .mdi { font-size: 40px; color: #a2aec0; margin-bottom: 14px; }
.studio-destination-preview { margin-top: 18px; padding: 14px; background: #f8f9fc; border-radius: 6px; overflow-wrap: anywhere; }
.studio-destination-preview p { margin: 8px 0; font-size: 13px; }
.studio-destination-preview small { font-size: 11px; color: #77809a; }
.studio-field { display: flex; flex-direction: column; gap: 5px; margin: 0 0 12px; font-size: 12px; }
.studio-inspector .form-control { min-width: 0; padding: 7px 8px; border-color: #dce2f2; border-radius: 5px; font-size: 12px; }
.studio-field-heading { display: flex; align-items: center; gap: 6px; }
.studio-field-heading .details-icon:disabled { opacity: .4; cursor: default; }
.studio-field textarea { resize: none; overflow: hidden; overflow-wrap: anywhere; line-height: 1.4; min-height: 48px; }
.studio-field textarea[rows="1"] { min-height: 32px; }
.studio-dimensions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-bottom: 15px; }
.studio-dimensions > .studio-field { margin-bottom: 0; }
fieldset { border: 0; min-width: 0; padding: 0; }
legend { width: auto; font-size: 13px; margin-bottom: 8px; font-weight: 500; }
.studio-size { display: flex; gap: 8px; align-items: flex-end; }
.studio-size label { min-width: 0; margin: 0; flex: 1; font-size: 11px; color: #77809a; }
.studio-size input { margin-top: 5px; }
.studio-size > span { padding-bottom: 10px; color: #77809a; }
.studio-render-scales { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 6px; }
.studio-render-scales > span { flex-basis: 100%; font-size: 11px; color: #77809a; }
.studio-render-scales .btn { min-width: 34px; height: 26px; padding: 0 7px; font-size: 12px; }
.studio-check { display: flex; align-items: center; gap: 8px; margin: 0 0 18px; font-size: 12px; color: #68718a; }
.studio-check input { accent-color: #4b49ac; }
.studio-preview-content { display: flex; flex-direction: column; flex: 1; min-height: 0; }
.studio-preview-toggle { align-self: flex-start; flex-shrink: 0; margin-top: 8px; }
.studio-preview { margin: 0; overflow: hidden; }
.studio-preview-tabs { display: flex; align-items: center; flex-wrap: wrap; gap: 8px 14px; padding: 7px 12px; background: #f8f9fc; }
.studio-preview-modes { display: flex; flex-wrap: wrap; gap: 14px; }
.studio-preview-tabs button { background: none; border: 0; padding: 5px 0; cursor: pointer; font-size: 12px; color: #77809a; }
.studio-preview-tabs button.active { color: #4b49ac; font-weight: 600; }
.studio-preview-tabs a { margin-left: auto; font-size: 12px; }
.studio-preview-comparison { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); }
.studio-preview-comparison figure { min-width: 0; margin: 0; }
.studio-preview-comparison figure + figure { border-left: 1px solid #e0e4ec; }
.studio-image { height: var(--studio-preview-height); display: flex; align-items: center; justify-content: center; padding: 8px; background: repeating-conic-gradient(#f1f2f7 0% 25%, white 0% 50%) 50% / 12px 12px; }
.studio-image img { width: 100%; height: 100%; object-fit: contain; }
.studio-animation-info { font-size: 11px; line-height: 1.5; color: #68718a; margin-top: 10px; }
.studio-animation-info > summary { cursor: pointer; }
.studio-animation-info p { margin: 8px 0 0; }
.studio-provenance { flex: 1; min-height: 0; max-height: 65dvh; overflow: auto; font-size: 11px; color: #77809a; }
.studio-provenance dl { margin: 12px 0; }
.studio-provenance dd { overflow-wrap: anywhere; font-family: monospace; }
.studio-metadata-file { display: flex; align-items: flex-start; gap: 8px; }
.studio-metadata-file > span:first-child { flex: 1; min-width: 0; }
.studio-file-actions { display: flex; flex-shrink: 0; gap: 4px; }
.studio-file-actions button:disabled { opacity: .4; cursor: default; }
.studio-provenance pre { margin-bottom: 0; max-height: none; overflow: visible; white-space: pre-wrap; overflow-wrap: anywhere; }
.studio-footer-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.studio-footer { justify-content: space-between; }
.studio-footer label { margin: 0; }
.studio-output-path { padding: 9px 12px; margin: 0; font-size: 11px; color: #77809a; overflow-wrap: anywhere; }
.studio-output-path small { display: block; margin-top: 4px; }
.studio-workflow { font-family: monospace; font-size: 12px; }
.studio-models { max-width: 740px; margin: auto; }
.studio-models fieldset { margin: 24px 0; padding-top: 18px; border-top: 1px solid #e0e4ec; }
.studio-models legend { font-size: 16px; }
@media (min-width: 992px) {
  .studio-page { flex: none; height: clamp(540px, calc(100dvh - 300px), 800px); }
  .studio-page .studio-body { overflow-y: auto; }
  .studio-page .studio-editor, .studio-page .studio-editor > form, .studio-page .studio-workbench,
  .studio-page .studio-preview-column, .studio-page .studio-preview, .studio-page .studio-image,
  .studio-page .studio-preview-comparison, .studio-page .studio-preview-comparison figure { min-height: 0; }
  .studio-page .studio-preview-column, .studio-page .studio-preview-content { overflow: hidden; }
  .studio-page .studio-provenance { max-height: none; }
  .studio-page .studio-selection-grid { flex: 1; min-height: 0; max-height: none; }
  .studio-page .studio-inspector { overflow-y: auto; }
}
@container (max-width: 480px) { .studio-workbench { grid-template-columns: minmax(0, 1fr); } .studio-image { height: 250px; } .studio-preview-placeholder { min-height: 240px; } }
@media (max-width: 767px) { .studio-editor-heading { flex-wrap: wrap; } .studio-preview-column, .studio-inspector { padding: 10px; } }
@media (max-width: 767px) { .studio-dimensions { grid-template-columns: minmax(0, 1fr); } .studio-tabs { gap: 16px; padding: 0 14px; } .studio-body { padding: 16px; } }
</style>
