<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import type { ReportAsset } from '../types';
import { baseName, reportPreviewURL, time } from '../format';
import { studioAPI, generatedURL, jobGeneratedURL, type ImageJobs, type ImageMetadata, type ImageSettings, type MetadataDocument, type StudioCatalog } from '../imageStudio';
import AppModal from './AppModal.vue';
import ImageStudioBrowser from './ImageStudioBrowser.vue';
import ImageStudioQueue from './ImageStudioQueue.vue';
import { openDeclaration, openResourceFolder, registerNavigationGuard } from '../workspace';

const props = defineProps<{ row?: ReportAsset; stacked?: boolean; embedded?: boolean }>();
const emit = defineEmits<{ close: [] }>();
const tab = ref<'metadata' | 'queue' | 'models' | 'remote'>('metadata');
const catalog = ref<StudioCatalog | null>(null);
const document = ref<MetadataDocument | null>(null);
const selected = ref('');
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
const previewJob = ref('');
const tags = ref('');
const objects = ref('');
const prompt = ref('');
const previewFailed = ref(false);
const dirty = computed(() => !!document.value && JSON.stringify([document.value.metadata, tags.value, objects.value, prompt.value]) !== original.value);
const modelsDirty = computed(() => !!settings.value && JSON.stringify(settings.value.settings) !== settingsOriginal.value);
const current = computed(() => catalog.value?.files.find(file => file.file === selected.value));
const metadata = computed(() => document.value?.metadata);
const isSequence = computed(() => document.value?.kind === 'sequence');
const fallbackPrompt = computed(() => [metadata.value?.analysis.description, metadata.value?.analysis.scene].filter(Boolean).join('\n'));
const activeJobs = computed(() => jobs.value.jobs.filter(job => ['queued', 'running', 'cancelling'].includes(job.state)));
const previewURL = computed(() => !document.value ? '' : preview.value === 'generated'
  ? previewJob.value ? jobGeneratedURL(previewJob.value, lastFinished.value) : generatedURL(document.value.file, lastFinished.value) : isSequence.value
    ? `/api/image-studio/sequence-preview?${new URLSearchParams({ file: document.value.file, revision: document.value.revision })}`
    : reportPreviewURL(document.value.file, document.value.revision));
const lastFinished = computed(() => jobs.value.jobs.flatMap(job => job.finishedAt ? [job.finishedAt] : []).sort().pop() ?? '');
const previewOutput = computed(() => jobs.value.jobs.find(job => job.id === previewJob.value)?.result ?? document.value?.generated);
let timer: ReturnType<typeof setTimeout> | undefined;
let disposed = false;
let loadId = 0;

function clearMessages() { error.value = ''; message.value = ''; }
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
function canLeave() {
  return !working.value && guardDiscard() && (!modelsDirty.value || window.confirm('Discard unsaved model settings?'));
}
const unregisterGuard = props.embedded ? registerNavigationGuard(canLeave) : undefined;
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
}
async function selectFile(file: string, discard = true) {
  if (discard && !guardDiscard()) return false;
  clearMessages();
  const request = ++loadId;
  selected.value = file;
  loading.value = true;
  try {
    const value = await studioAPI<MetadataDocument>(`metadata?file=${encodeURIComponent(file)}`);
    if (request !== loadId || disposed || (!discard && dirty.value)) return false;
    selected.value = file;
    creating.value = false;
    preview.value = value.generated ? 'generated' : 'source';
    previewJob.value = '';
    previewFailed.value = false;
    markClean(value);
    return true;
  } catch (e) { error.value = (e as Error).message; return false; } finally { if (request === loadId) loading.value = false; }
}
async function viewJob(file: string, jobId?: string) {
  if (await selectFile(file) && jobId) { previewJob.value = jobId; preview.value = 'generated'; }
  tab.value = 'metadata';
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
    creating.value = false;
    markClean(saved);
    await loadCatalog();
    message.value = 'Metadata saved.';
    return true;
  } catch (e) { error.value = (e as Error).message; return false; } finally { working.value = false; }
}
async function enqueue(kind: 'metadata' | 'image', batch?: string[]) {
  if (!batch && kind === 'image' && (dirty.value || creating.value || !document.value?.exists) && !await save()) return;
  if (kind === 'metadata' && !batch && !guardDiscard()) return;
  clearMessages();
  working.value = true;
  try {
    const body = batch ? { kind, files: batch, overwrite: overwrite.value }
      : { kind, files: [document.value?.file], overwrite: overwrite.value };
    jobs.value = await studioAPI<ImageJobs>('jobs', body);
    message.value = `${jobs.value.submitted?.length ?? 0} job(s) submitted. ${kind === 'image' ? 'Existing results with the same settings' : 'Existing metadata'} are ${overwrite.value ? 'replaced after success' : 'kept'}.`;
    if (kind === 'metadata') tab.value = 'queue';
  } catch (e) { error.value = (e as Error).message; } finally { working.value = false; }
}
async function retry(id: string, force = false) {
  clearMessages();
  working.value = true;
  try {
    jobs.value = await studioAPI<ImageJobs>('jobs/retry', { id, force });
    message.value = force ? 'Regeneration submitted. Existing output will be replaced after success.'
      : 'Retry submitted using the latest saved model settings.';
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
    if (!document.value && !selected.value && catalog.value?.files[0]) await selectFile(catalog.value.files[0].file, false);
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
    <div class="studio-body" :class="{ 'modal-body': !embedded }">
      <p v-if="error" class="alert alert-danger" role="alert">{{ error }}</p>
      <p v-if="message" class="alert alert-info" role="status">{{ message }}</p>
      <ImageStudioBrowser v-show="tab === 'metadata'" :files="catalog?.files ?? []" :selected="selected" :working="working" :batch="!row?.sequence"
                            @select="selectFile($event)" @create="newMetadata" @analyze="enqueue('metadata', $event)" @generate="enqueue('image', $event)">
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
                <p v-if="preview === 'generated'" class="studio-output-path">{{ previewOutput }}<small>The latest generated image is also available beside the metadata file.</small></p>
              </div>
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
              <label class="studio-field">Description<textarea v-model="metadata.analysis.description" rows="4" class="form-control" placeholder="Describe the image you want to create…" /></label>
              <label class="studio-field">Scene<textarea v-model="metadata.analysis.scene" rows="2" class="form-control" placeholder="Setting, background and lighting" /></label>
              <label class="studio-field">Generation prompt<textarea v-model="prompt" aria-label="Generation prompt" rows="4" class="form-control" :placeholder="fallbackPrompt || 'Use the description and scene, or enter a custom prompt'" /><small>Leave empty to use the description and scene. Transparency instructions are added automatically.</small></label>
              <div class="studio-dimensions"><label class="studio-field">Objects<input v-model="objects" class="form-control" placeholder="Comma-separated objects"></label><label class="studio-field">Tags<input v-model="tags" class="form-control" placeholder="Comma-separated tags"></label></div>
              <label class="studio-field">Text in image<textarea v-model="metadata.analysis.text" rows="2" class="form-control" /></label>
              <details class="studio-provenance">
                <summary>Metadata file and provenance</summary>
                <dl>
                  <dt>JSON file</dt>
                  <dd class="studio-metadata-file">
                    <span>{{ document?.path || `${newPath}.json` }}</span>
                    <span class="studio-file-actions">
                      <button type="button" class="details-icon" aria-label="Open metadata folder" :title="document?.exists && !creating ? 'Open metadata folder' : 'Save metadata first'" :disabled="working || loading || creating || !document?.exists" @click="document && openResourceFolder(document.path)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
                      <button type="button" class="details-icon" aria-label="Open metadata file in VS Code" :title="document?.exists && !creating ? 'Open metadata file in VS Code' : 'Save metadata first'" :disabled="working || loading || creating || !document?.exists" @click="document && openDeclaration(document.path, 1)"><i aria-hidden="true" class="mdi mdi-code-braces" /></button>
                    </span>
                  </dd>
                  <dt>Model</dt><dd>{{ metadata.model }}</dd>
                  <dt>Created</dt><dd>{{ time(metadata.created_at) }}</dd>
                  <dt v-if="metadata.image.sha256">Source SHA-256</dt><dd v-if="metadata.image.sha256">{{ metadata.image.sha256 }}</dd>
                </dl>
                <pre>{{ JSON.stringify(metadata, null, 2) }}</pre>
              </details>
            </form>
          </section>
      </ImageStudioBrowser>
      <ImageStudioQueue v-if="tab === 'queue'" :jobs="jobs" :catalog="catalog" :working="working"
        @retry="retry" @cancel="cancel" @cancel-all="cancelAll" @compose="tab = 'metadata'"
        @view="viewJob" />
      <form v-else-if="tab === 'models' && settings" class="studio-models" @submit.prevent="saveModels">
        <p class="studio-hint">Configure installed weights and a local LM Studio server. Enable Remote models to use another computer for either operation. No models are downloaded. Settings are stored in {{ settings.path }}.</p>
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
      <form v-else-if="tab === 'remote' && settings" class="studio-models" @submit.prevent="saveModels">
        <p class="studio-hint">Use LM Studio and ComfyUI on other computers. Enable either connection to use it for new jobs; otherwise the corresponding Local models settings apply. Settings are stored in {{ settings.path }}.</p>
        <fieldset><legend>Vision analysis · Remote LM Studio</legend>
          <label class="studio-check"><input v-model="settings.settings.remote.analysis.enabled" type="checkbox"> Use remote LM Studio for analysis</label>
          <label class="studio-field">Remote LM Studio API base URL<input v-model="settings.settings.remote.analysis.base_url" aria-label="Remote LM Studio API base URL" class="form-control" type="url" required placeholder="http://your-lm-studio-host:1234/v1"><small>Enable Serve on Local Network in LM Studio on that computer. Include /v1.</small></label>
          <label class="studio-field">Remote vision model<input v-model="settings.settings.remote.analysis.model" class="form-control" required></label>
          <label class="studio-field">LM Studio API key environment variable<input v-model="settings.settings.remote.analysis.api_key_env" aria-label="LM Studio API key environment variable" class="form-control" placeholder="LM_STUDIO_REMOTE_API_KEY"><small>Optional. Set this variable on the computer running EGT GDA Sync before starting it. Leave empty for a server without authentication.</small></label>
          <div class="studio-dimensions"><label class="studio-field">Remote analysis timeout (seconds)<input v-model.number="settings.settings.remote.analysis.timeout" type="number" min="1" required class="form-control"></label><label class="studio-field">Remote maximum response tokens<input v-model.number="settings.settings.remote.analysis.max_tokens" type="number" min="1" required class="form-control"></label></div>
          <label class="studio-check"><input v-model="settings.settings.remote.analysis.load_model" type="checkbox"> Load the remote vision model when analysis starts</label>
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
      <label class="studio-check"><input v-model="overwrite" type="checkbox"> Replace existing metadata / generated PNGs after success</label>
      <div class="studio-footer-actions">
        <template v-if="tab === 'metadata' && metadata">
          <button type="button" class="btn btn-outline-primary" :disabled="working || loading" @click="save">Save metadata</button>
          <button type="button" class="btn btn-primary" :disabled="working || loading" @click="enqueue('image')">Generate image</button>
        </template>
        <button v-if="!embedded" type="button" class="btn btn-light" :disabled="working" @click="close">Close</button>
      </div>
    </div>
  </component>
</template>

<style scoped>
:global(.image-studio .modal-content) { height: min(920px, calc(100dvh - 64px)); }
.studio-page { overflow: hidden; }
.studio-page .studio-body { overflow: visible; }
.studio-page .studio-footer { display: flex; flex-wrap: wrap; gap: 16px; padding: 18px 24px; border-top: 1px solid #e0e4ec; background: white; position: sticky; bottom: 0; z-index: 2; }
.studio-tabs { display: flex; flex-wrap: wrap; gap: 24px; padding: 0 26px; border-bottom: 1px solid #e0e4ec; flex-shrink: 0; }
.studio-tabs button { border: 0; border-bottom: 3px solid transparent; background: none; padding: 16px 0; color: #68718a; cursor: pointer; }
.studio-tabs button.active { color: #4b49ac; border-color: #4b49ac; }
.studio-tabs .mdi { margin-right: 6px; }
.studio-body { padding: 24px; overflow-y: auto; min-height: 0; }
.studio-hint, .studio-field small, fieldset > small { font-size: 12px; color: #77809a; line-height: 1.5; }
.studio-hint { margin: 0; overflow-wrap: anywhere; }
.studio-editor { min-width: 0; }
.studio-editor h6 { margin: 0 0 6px; overflow-wrap: anywhere; }
.studio-editor-heading { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 18px; }
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
.studio-render-scales { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; margin: 10px 0 6px; }
.studio-render-scales > span { font-size: 11px; color: #77809a; margin-right: 2px; }
.studio-render-scales .btn { min-width: 34px; height: 26px; padding: 0 7px; font-size: 12px; }
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
.studio-metadata-file { display: flex; align-items: flex-start; gap: 8px; }
.studio-metadata-file > span:first-child { flex: 1; min-width: 0; }
.studio-file-actions { display: flex; flex-shrink: 0; gap: 4px; }
.studio-file-actions button:disabled { opacity: .4; cursor: default; }
.studio-provenance pre { max-height: 480px; overflow: auto; }
.studio-footer-actions { display: flex; flex-wrap: wrap; gap: 10px; }
.studio-footer { justify-content: space-between; }
.studio-footer label { margin: 0; }
.studio-output-path { padding: 9px 12px; margin: 0; font-size: 11px; color: #77809a; overflow-wrap: anywhere; }
.studio-output-path small { display: block; margin-top: 4px; }
.studio-workflow { font-family: monospace; font-size: 12px; }
.studio-models { max-width: 740px; margin: auto; }
.studio-models fieldset { margin: 24px 0; padding-top: 18px; border-top: 1px solid #e0e4ec; }
.studio-models legend { font-size: 16px; }
@media (max-width: 767px) { .studio-dimensions { grid-template-columns: minmax(0, 1fr); } .studio-tabs { gap: 16px; padding: 0 14px; } .studio-body { padding: 16px; } }
</style>
