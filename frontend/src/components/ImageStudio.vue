<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ReportAsset } from '../types';
import { baseName, reportPreviewURL, time } from '../format';
import { studioAPI, generatedURL, type ImageJobs, type ImageMetadata, type ImageSettings, type MetadataDocument, type StudioCatalog } from '../imageStudio';
import AppModal from './AppModal.vue';

const props = defineProps<{ row?: ReportAsset; assets?: ReportAsset[]; stacked?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const tab = ref<'metadata' | 'queue' | 'models'>('metadata');
const catalog = ref<StudioCatalog | null>(null);
const document = ref<MetadataDocument | null>(null);
const selected = ref('');
const query = ref('');
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
const overwrite = ref(false);
const preview = ref<'source' | 'generated'>('source');
const tags = ref('');
const objects = ref('');
const prompt = ref('');
const previewFailed = ref(false);
const dirty = computed(() => !!document.value && JSON.stringify([document.value.metadata, tags.value, objects.value, prompt.value]) !== original.value);
const modelsDirty = computed(() => !!settings.value && JSON.stringify(settings.value.settings) !== settingsOriginal.value);
const files = computed(() => catalog.value?.files.filter(file => file.name.toLowerCase().includes(query.value.toLowerCase())) ?? []);
const current = computed(() => catalog.value?.files.find(file => file.file === selected.value));
const metadata = computed(() => document.value?.metadata);
const isSequence = computed(() => document.value?.kind === 'sequence');
const fallbackPrompt = computed(() => [metadata.value?.analysis.description, metadata.value?.analysis.scene].filter(Boolean).join('\n'));
const batchAssets = computed(() => props.row ? [props.row.id] : (props.assets ?? []).filter(row => row.type === 'texture'
  && ['available', 'supplementary'].includes(row.category)).map(row => row.id));
const recentJobs = computed(() => [...jobs.value.jobs].reverse());
const activeJobs = computed(() => jobs.value.jobs.filter(job => ['queued', 'running', 'cancelling'].includes(job.state)));
const previewURL = computed(() => !document.value ? '' : preview.value === 'generated'
  ? generatedURL(document.value.file, lastFinished.value) : isSequence.value
    ? `/api/image-studio/sequence-preview?${new URLSearchParams({ file: document.value.file, revision: document.value.revision })}`
    : reportPreviewURL(document.value.file, document.value.revision));
const lastFinished = computed(() => jobs.value.jobs.flatMap(job => job.finishedAt ? [job.finishedAt] : []).sort().pop() ?? '');
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let loadId = 0;

function clearMessages() { error.value = ''; message.value = ''; }
function guardDiscard() { return !dirty.value || window.confirm('Discard unsaved metadata changes?'); }
function close() {
  if (working.value || (!guardDiscard()) || (modelsDirty.value && !window.confirm('Discard unsaved model settings?'))) return;
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
}
async function selectFile(file: string, discard = true) {
  if (discard && !guardDiscard()) return;
  clearMessages();
  const request = ++loadId;
  selected.value = file;
  loading.value = true;
  try {
    const value = await studioAPI<MetadataDocument>(`metadata?file=${encodeURIComponent(file)}`);
    if (request !== loadId || disposed || (!discard && dirty.value)) return;
    selected.value = file;
    creating.value = false;
    preview.value = value.generated ? 'generated' : 'source';
    previewFailed.value = false;
    markClean(value);
  } catch (e) { error.value = (e as Error).message; } finally { if (request === loadId) loading.value = false; }
}
function newMetadata() {
  if (!guardDiscard()) return;
  loadId++;
  loading.value = false;
  clearMessages();
  creating.value = true;
  selected.value = '';
  const metadata: ImageMetadata = {
    schema_version: 1, image: { filename: 'new-image.png', width: 1024, height: 1024, transparency: false },
    generation: { width: 1024, height: 1024 }, model: 'manual', created_at: new Date().toISOString(),
    analysis: { description: '', scene: '', objects: [], tags: [], text: '' },
  };
  markClean({ file: '', path: '', exists: false, revision: '', metadata, generated: null });
  preview.value = 'source';
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
    creating.value = false;
    markClean(saved);
    await loadCatalog();
    message.value = 'Metadata saved.';
    return true;
  } catch (e) { error.value = (e as Error).message; return false; } finally { working.value = false; }
}
async function enqueue(kind: 'metadata' | 'image', batch = false) {
  if (!batch && kind === 'image' && (dirty.value || creating.value || !document.value?.exists) && !await save()) return;
  if (kind === 'metadata' && !batch && !guardDiscard()) return;
  clearMessages();
  working.value = true;
  try {
    const body = batch ? { kind, assets: batchAssets.value, overwrite: overwrite.value }
      : { kind, files: [document.value?.file], overwrite: overwrite.value };
    jobs.value = await studioAPI<ImageJobs>('jobs', body);
    message.value = `${jobs.value.submitted?.length ?? 0} job(s) submitted. Existing outputs are ${overwrite.value ? 'replaced after success' : 'kept'}.`;
    tab.value = 'queue';
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
async function cancel(id: string) {
  try { jobs.value = await studioAPI<ImageJobs>('jobs/cancel', { id }); }
  catch (e) { error.value = (e as Error).message; }
}
async function pollJobs() {
  try {
    const value = await studioAPI<ImageJobs>('jobs');
    const changed = value.jobs.some(job => job.finishedAt && !jobs.value.jobs.some(old => old.id === job.id && old.finishedAt));
    jobs.value = value;
    if (changed) {
      await loadCatalog();
      if (document.value && !loading.value && selected.value === document.value.file && !dirty.value && !creating.value) await selectFile(document.value.file, false);
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
    if (!document.value && !selected.value && catalog.value?.files[0]) await selectFile(catalog.value.files[0].file, false);
  } catch (e) { error.value = (e as Error).message; }
  if (!disposed) void pollJobs();
});
onBeforeUnmount(() => { disposed = true; loadId++; clearTimeout(timer); });
</script>

<template>
  <AppModal title="Image studio" xl :stacked="stacked" dialog-class="image-studio" @close="close">
    <div class="studio-tabs" role="tablist" aria-label="Image studio sections">
      <button v-for="item in (['metadata', 'queue', 'models'] as const)" :key="item" type="button" role="tab"
              :aria-selected="tab === item" :class="{ active: tab === item }" @click="tab = item">
        <i aria-hidden="true" :class="['mdi', item === 'metadata' ? 'mdi-image-edit-outline' : item === 'queue' ? 'mdi-format-list-bulleted' : 'mdi-tune']" />
        {{ item === 'metadata' ? 'Metadata' : item === 'queue' ? 'Generation queue' : 'Local models' }}
        <span v-if="item === 'queue' && activeJobs.length" class="badge badge-light">{{ activeJobs.length }}</span>
      </button>
    </div>
    <div class="modal-body studio-body">
      <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
      <p v-if="message" class="alert alert-info" role="status">{{ message }}</p>
      <template v-if="tab === 'metadata'">
        <div class="studio-layout">
          <aside class="studio-sidebar" aria-label="Image files">
            <button type="button" class="btn btn-outline-primary" @click="newMetadata"><i aria-hidden="true" class="mdi mdi-plus" /> New image metadata</button>
            <label class="sr-only" for="studio-search">Find image</label>
            <input id="studio-search" v-model="query" class="form-control" type="search" placeholder="Find image or animation…">
            <p class="studio-hint">{{ row?.sequence ? 'One shared description and prompt for the entire animation.' : `${catalog?.files.length ?? 0} images, animations and drafts` }}</p>
            <div class="studio-file-list">
              <button v-for="file in files" :key="file.file" type="button" :class="['studio-file', { active: selected === file.file }]" :title="file.name" @click="selectFile(file.file)">
                <i aria-hidden="true" :class="['mdi', file.kind === 'sequence' ? 'mdi-animation-outline' : file.metadata ? 'mdi-file-document-check-outline' : 'mdi-image-outline']" />
                <span>{{ file.name }}<small><template v-if="file.kind === 'sequence'">ImageSeq · {{ file.frameCount }} frames · </template>{{ file.metadata ? 'Metadata saved' : file.exists ? 'No metadata' : 'New image' }}{{ file.generated ? ' · Generated' : '' }}</small></span>
              </button>
            </div>
            <template v-if="batchAssets.length && !row?.sequence">
              <hr>
              <p class="studio-hint">{{ row?.sequence ? 'Entire ImageSeq' : row ? 'This asset' : `${batchAssets.length} filtered image assets` }}</p>
              <button type="button" class="btn btn-outline-primary btn-sm" :disabled="working" @click="enqueue('metadata', true)">Analyze batch</button>
              <button type="button" class="btn btn-outline-primary btn-sm" :disabled="working" @click="enqueue('image', true)">Generate batch</button>
            </template>
          </aside>
          <section class="studio-editor" aria-label="Image metadata editor">
            <p v-if="loading" role="status">Loading metadata…</p>
            <p v-else-if="!metadata" class="text-muted">Choose an image, or create metadata for a new image.</p>
            <form v-else @submit.prevent="save">
              <p v-if="document?.sourceError" class="alert alert-warning">{{ document.sourceError }}</p>
              <div class="studio-editor-heading">
                <div><h6>{{ creating ? 'Create a new image' : isSequence ? current?.name ?? metadata.sequence?.id ?? 'Animation' : baseName(document?.file ?? '') }}</h6><p class="studio-hint">{{ document?.exists ? 'Saved metadata' : 'Manual metadata draft' }}<span v-if="dirty"> · Unsaved changes</span></p></div>
                <button v-if="!creating && current?.exists" type="button" class="btn btn-outline-primary btn-sm" :disabled="working" @click="enqueue('metadata')">{{ isSequence ? 'Analyze animation' : 'Analyze image' }}</button>
              </div>
              <p v-if="isSequence && metadata.sequence" class="studio-animation-info">{{ metadata.sequence.frames.length }} frames · {{ metadata.sequence.frameTime }} ms per frame. One description covers the animation’s appearance and motion. Generating an image creates a single still from the shared prompt.</p>
              <label v-if="creating" class="studio-field">Image path <input v-model="newPath" aria-label="Image path" class="form-control" required placeholder="art/generated/new-image.png"><small>Relative to the game folder. A .json metadata file is created beside this path.</small></label>
              <div v-if="!creating && (current?.exists || document?.generated)" :class="['studio-preview', { 'is-sequence': isSequence && preview === 'source' }]">
                <div class="studio-preview-tabs">
                  <button v-if="current?.exists" type="button" :class="{ active: preview === 'source' }" @click="preview = 'source'; previewFailed = false">{{ isSequence ? 'Animation frames' : 'Source image' }}</button>
                  <button v-if="document?.generated" type="button" :class="{ active: preview === 'generated' }" @click="preview = 'generated'; previewFailed = false">Generated image</button>
                  <a v-if="preview === 'generated'" :href="previewURL" target="_blank" rel="noopener">Open PNG <i aria-hidden="true" class="mdi mdi-open-in-new" /></a>
                </div>
                <div class="studio-image"><img v-if="!previewFailed" :src="previewURL" :alt="preview === 'source' ? isSequence ? 'Representative animation frames' : 'Source image' : 'Generated image'" @error="previewFailed = true"><span v-else class="text-muted">Preview unavailable</span></div>
                <p v-if="isSequence && preview === 'source'" class="studio-output-path">Frames are shown in playback order. Analysis uses up to 12 samples across the full animation, including the first and last frames.</p>
                <p v-if="preview === 'generated'" class="studio-output-path">{{ document?.generated }}<small>Rescan the Asset library to list this PNG as a new asset.</small></p>
              </div>
              <div class="studio-dimensions">
                <fieldset><legend>Output resolution</legend><div class="studio-size"><label>Width<input v-model.number="metadata.image.width" type="number" min="1" max="16384" required class="form-control"></label><span>×</span><label>Height<input v-model.number="metadata.image.height" type="number" min="1" max="16384" required class="form-control"></label></div></fieldset>
                <fieldset><legend>Model render resolution</legend><div class="studio-size"><label>Render width<input v-model.number="metadata.generation.width" type="number" min="32" max="16384" step="32" required class="form-control"></label><span>×</span><label>Render height<input v-model.number="metadata.generation.height" type="number" min="32" max="16384" step="32" required class="form-control"></label></div><small>Multiples of 32. Resized to the output resolution.</small></fieldset>
              </div>
              <label class="studio-check"><input v-model="metadata.image.transparency" type="checkbox"> Transparent background</label>
              <label class="studio-field">Description<textarea v-model="metadata.analysis.description" rows="4" class="form-control" placeholder="Describe the image you want to create…" /></label>
              <label class="studio-field">Scene<textarea v-model="metadata.analysis.scene" rows="2" class="form-control" placeholder="Setting, background and lighting" /></label>
              <label class="studio-field">Generation prompt<textarea v-model="prompt" aria-label="Generation prompt" rows="4" class="form-control" :placeholder="fallbackPrompt || 'Use the description and scene, or enter a custom prompt'" /><small>Leave empty to use the description and scene. Transparency instructions are added automatically.</small></label>
              <div class="studio-dimensions"><label class="studio-field">Objects<input v-model="objects" class="form-control" placeholder="Comma-separated objects"></label><label class="studio-field">Tags<input v-model="tags" class="form-control" placeholder="Comma-separated tags"></label></div>
              <label class="studio-field">Text in image<textarea v-model="metadata.analysis.text" rows="2" class="form-control" /></label>
              <details class="studio-provenance"><summary>Metadata file and provenance</summary><dl><dt>JSON file</dt><dd>{{ document?.path || `${newPath}.json` }}</dd><dt>Model</dt><dd>{{ metadata.model }}</dd><dt>Created</dt><dd>{{ time(metadata.created_at) }}</dd><dt v-if="metadata.image.sha256">Source SHA-256</dt><dd v-if="metadata.image.sha256">{{ metadata.image.sha256 }}</dd></dl><pre>{{ JSON.stringify(metadata, null, 2) }}</pre></details>
            </form>
          </section>
        </div>
      </template>
      <section v-else-if="tab === 'queue'" aria-label="Generation jobs">
        <div class="studio-queue-heading"><div><h6>{{ jobs.running ? 'A local model is working' : jobs.queued ? 'Jobs waiting' : 'Queue is idle' }}</h6><p class="studio-hint">One job runs at a time. Jobs of the same type and model are grouped to reduce model switching. You can close this popup while they run.</p></div><span class="badge badge-light">{{ jobs.queued }} queued</span></div>
        <p v-if="!recentJobs.length" class="text-muted">Analyze an image or generate one from saved metadata to start a job.</p>
        <div v-for="job in recentJobs" :key="job.id" class="studio-job">
          <i aria-hidden="true" :class="['mdi', job.state === 'running' ? 'mdi-loading mdi-spin' : job.kind === 'metadata' ? 'mdi-file-document-outline' : 'mdi-image-outline']" />
          <div><strong>{{ job.kind === 'metadata' ? 'Analyze' : 'Generate' }} · {{ job.label ?? baseName(job.source) }}</strong><span class="studio-hint studio-job-path">{{ job.source }}</span><p v-if="job.error" class="text-danger">{{ job.error }}</p><p v-else-if="job.message" class="studio-hint">{{ job.message }}</p></div>
          <span :class="['badge', job.state === 'failed' ? 'badge-danger' : job.state === 'succeeded' ? 'badge-success' : 'badge-light']">{{ job.state }}</span>
          <button v-if="['queued', 'running'].includes(job.state)" type="button" class="btn btn-outline-secondary btn-sm" @click="cancel(job.id)">Cancel</button>
          <button v-if="job.state === 'succeeded'" type="button" class="btn btn-outline-primary btn-sm" @click="selectFile(job.target ?? job.source); tab = 'metadata'">View</button>
        </div>
      </section>
      <form v-else-if="settings" class="studio-models" @submit.prevent="saveModels">
        <p class="studio-hint">Models run on this computer. Configure installed weights and a local LM Studio server. No models are downloaded. Settings are stored in {{ settings.path }}.</p>
        <fieldset><legend>Vision analysis · LM Studio</legend>
          <label class="studio-field">API base URL<input v-model="settings.settings.analysis.base_url" class="form-control" required></label>
          <label class="studio-field">Vision model<input v-model="settings.settings.analysis.model" class="form-control" required></label>
          <div class="studio-dimensions"><label class="studio-field">Analysis timeout (seconds)<input v-model.number="settings.settings.analysis.timeout" type="number" min="1" class="form-control"></label><label class="studio-field">Maximum response tokens<input v-model.number="settings.settings.analysis.max_tokens" type="number" min="1" class="form-control"></label></div>
          <label class="studio-check"><input v-model="settings.settings.analysis.load_model" type="checkbox"> Load the vision model when analysis starts</label>
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
    </div>
    <div class="modal-footer studio-footer">
      <label class="studio-check"><input v-model="overwrite" type="checkbox"> Replace existing metadata / generated PNGs after success</label>
      <div class="studio-footer-actions">
        <template v-if="tab === 'metadata' && metadata">
          <button type="button" class="btn btn-outline-primary" :disabled="working || loading" @click="save">Save metadata</button>
          <button type="button" class="btn btn-primary" :disabled="working || loading" @click="enqueue('image')">Save &amp; generate image</button>
        </template>
        <button type="button" class="btn btn-light" :disabled="working" @click="close">Close</button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
:global(.image-studio .modal-content) { height: min(920px, calc(100dvh - 64px)); }
.studio-tabs { display: flex; gap: 24px; padding: 0 26px; border-bottom: 1px solid #e0e4ec; flex-shrink: 0; }
.studio-tabs button { border: 0; border-bottom: 3px solid transparent; background: none; padding: 16px 0; color: #68718a; cursor: pointer; }
.studio-tabs button.active { color: #4b49ac; border-color: #4b49ac; }
.studio-tabs .mdi { margin-right: 6px; }
.studio-body { padding: 24px; overflow-y: auto; min-height: 0; }
.studio-layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); gap: 28px; align-items: start; }
.studio-sidebar { display: flex; flex-direction: column; gap: 12px; position: sticky; top: 0; min-width: 0; }
.studio-sidebar hr { margin: 3px 0; width: 100%; }
.studio-hint, .studio-field small, fieldset > small { font-size: 12px; color: #77809a; line-height: 1.5; }
.studio-hint { margin: 0; }
.studio-file-list { max-height: 410px; overflow-y: auto; border: 1px solid #e0e4ec; border-radius: 6px; }
.studio-file { display: flex; align-items: flex-start; gap: 9px; text-align: left; padding: 11px; width: 100%; color: #384057; background: white; border: 0; border-bottom: 1px solid #edf0f5; cursor: pointer; }
.studio-file.active { background: #eeedfc; color: #4b49ac; }
.studio-file > span { overflow-wrap: anywhere; font-size: 12px; }
.studio-file small { display: block; color: #77809a; margin-top: 3px; }
.studio-editor { min-width: 0; }
.studio-editor h6 { margin: 0 0 6px; overflow-wrap: anywhere; }
.studio-editor-heading, .studio-queue-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
.studio-editor-heading .btn { flex-shrink: 0; }
.studio-field { display: flex; flex-direction: column; gap: 7px; margin: 0 0 18px; font-size: 13px; }
.studio-field textarea { resize: vertical; line-height: 1.5; min-height: 64px; }
.studio-dimensions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 20px; margin-bottom: 15px; }
.studio-dimensions > .studio-field { margin-bottom: 0; }
fieldset { border: 0; min-width: 0; padding: 0; }
legend { width: auto; font-size: 13px; margin-bottom: 8px; font-weight: 500; }
.studio-size { display: flex; gap: 8px; align-items: flex-end; }
.studio-size label { min-width: 0; margin: 0; flex: 1; font-size: 11px; color: #77809a; }
.studio-size input { margin-top: 5px; }
.studio-size > span { padding-bottom: 10px; color: #77809a; }
.studio-check { display: flex; align-items: center; gap: 8px; margin: 0 0 18px; font-size: 12px; color: #68718a; }
.studio-check input { accent-color: #4b49ac; }
.studio-preview { border: 1px solid #e0e4ec; border-radius: 7px; margin-bottom: 22px; overflow: hidden; }
.studio-preview-tabs { display: flex; align-items: center; gap: 14px; padding: 7px 12px; background: #f8f9fc; }
.studio-preview-tabs button { background: none; border: 0; padding: 5px 0; cursor: pointer; font-size: 12px; color: #77809a; }
.studio-preview-tabs button.active { color: #4b49ac; font-weight: 600; }
.studio-preview-tabs a { margin-left: auto; font-size: 12px; }
.studio-image { height: 180px; display: flex; align-items: center; justify-content: center; padding: 12px; background: repeating-conic-gradient(#f0f1f5 0% 25%, white 0% 50%) 50% / 16px 16px; }
.studio-image img { max-width: 100%; max-height: 100%; object-fit: contain; }
.studio-preview.is-sequence .studio-image { height: 380px; }
.studio-animation-info { font-size: 12px; line-height: 1.6; color: #68718a; padding: 12px 14px; border-radius: 6px; background: #f3f2fc; margin-bottom: 18px; }
.studio-provenance { margin: 20px 0; font-size: 12px; color: #77809a; }
.studio-provenance summary { cursor: pointer; color: #4b49ac; }
.studio-provenance dl { margin: 12px 0; }
.studio-provenance dd { overflow-wrap: anywhere; font-family: monospace; }
.studio-provenance pre { max-height: 240px; overflow: auto; }
.studio-footer-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.studio-footer { justify-content: space-between; }
.studio-footer label { margin: 0; }
.studio-output-path { padding: 9px 12px; margin: 0; font-size: 11px; color: #77809a; overflow-wrap: anywhere; }
.studio-output-path small { display: block; margin-top: 4px; }
.studio-job { display: flex; align-items: flex-start; gap: 14px; padding: 16px 0; border-bottom: 1px solid #e0e4ec; }
.studio-job > .mdi { color: #4b49ac; font-size: 22px; }
.studio-job > div { flex: 1; min-width: 0; }
.studio-job strong { font-size: 13px; }
.studio-job p { font-size: 12px; margin: 5px 0 0; overflow-wrap: anywhere; }
.studio-job-path { display: block; overflow-wrap: anywhere; }
.studio-models { max-width: 740px; margin: auto; }
.studio-models fieldset { margin: 24px 0; padding-top: 18px; border-top: 1px solid #e0e4ec; }
.studio-models legend { font-size: 16px; }
@media (max-width: 767px) { .studio-layout { grid-template-columns: minmax(0, 1fr); } .studio-sidebar { position: static; } .studio-file-list { max-height: 150px; } .studio-dimensions { grid-template-columns: minmax(0, 1fr); } .studio-tabs { gap: 16px; padding: 0 14px; } .studio-body { padding: 16px; } }
</style>
