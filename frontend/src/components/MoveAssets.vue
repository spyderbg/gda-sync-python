<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { AssetFolder, ChangePlan, MoveRequest, ReportAsset } from '../types';
import { busy, config, copy, moveAssets, movePreview } from '../workspace';
import { baseName, number, plural, relativePath, size } from '../format';
import AppModal from './AppModal.vue';
import ChangePreview from './ChangePreview.vue';
import FolderPicker from './FolderPicker.vue';
const props = defineProps<{ row?: ReportAsset; folder?: AssetFolder; folders?: AssetFolder[] }>();
const emit = defineEmits<{ close: [] }>();
const defaultTarget = () => {
  if (!props.row) return '';
  const path = props.row.resource.replaceAll('\\', '/').split('/');
  if (path[0] === '..') path.splice(0, 2);
  path.pop();
  return path.join('/');
};
const target = ref(defaultTarget() || '.');
const originalName = props.row ? baseName(props.row.resource) : '';
const name = ref(originalName);
const plan = ref<ChangePlan | null>(null);
const error = ref('');
const loading = ref(false);
const step = ref(1);
const stepHeading = ref<HTMLElement>();
const canRename = computed(() => !!props.row && !props.row.sequence);
const missingName = computed(() => canRename.value && !name.value.trim());
const request = computed<MoveRequest>(() => ({ ...(props.row ? { assets: [props.row.id] } : { folder: props.folder!.path }),
  target: target.value || '.', ...(canRename.value && name.value && name.value !== originalName ? { name: name.value } : {}) }));
const canReview = computed(() => !!plan.value && !loading.value && !missingName.value && !plan.value.blockers.length);
const fileCount = computed(() => plan.value?.files.length ?? 0);
const referenceCount = computed(() => Object.values(plan.value?.edits ?? {}).flat().filter(edit => edit.selected).length);
const changes = computed(() => `${number(fileCount.value)} file${plural(fileCount.value)} and ${number(referenceCount.value)} reference${plural(referenceCount.value)}`);
const sourcePath = computed(() => props.row?.resource ?? props.folder?.relative ?? '.');
const sourceAbsolutePath = computed(() => props.row?.resourcePath ?? props.folder?.path ?? '');
const sourceScope = computed(() => props.row?.scope ?? props.folder?.kind);
const sourceLabel = computed(() => sourceScope.value === 'other-game' ? 'From another game' : sourceScope.value === 'common' ? 'From the common folder' : sourceScope.value === 'outside' ? 'From outside this game' : 'Current location');
const operation = computed(() => {
  const modes = new Set(plan.value?.files.map(file => file.mode));
  if (modes.size > 1) return 'Mixed';
  if (modes.has('reuse')) return 'Reuse';
  if (modes.has('copy')) return 'Copy';
  if (modes.has('move')) return 'Move';
  return ['other-game', 'common', 'outside'].includes(sourceScope.value ?? '') ? 'Copy' : 'Move';
});
const sourceHint = computed(() => operation.value === 'Copy' ? (props.row && !props.row.directory && !props.row.sequence ? 'The original file will be kept.' : 'The original files will be kept.') : operation.value === 'Reuse' ? 'Identical files at the destination will be reused.' : operation.value === 'Mixed' ? 'Review which files will be moved, copied or reused in the next step.' : 'Files will move with their references. Files used by another game are copied.');
const subtitle = computed(() => props.row ? `${originalName}${props.row.size == null ? '' : ` · ${size(props.row.size)}`}` : `${number(props.folder?.assets ?? 0)} assets · ${sourcePath.value}`);
const destination = computed(() => {
  // The server's planned target is authoritative for a single file. Folders and sequences have many targets.
  if (props.row && !props.row.directory && !props.row.sequence && plan.value?.files.length === 1) return relativePath(plan.value.files[0].target, config.value?.destination);
  const folder = target.value.replaceAll('\\', '/').replace(/\/+$/, '');
  return [folder === '.' ? '' : folder, props.row ? name.value : ''].filter(Boolean).join('/') || '.';
});
let timer: ReturnType<typeof setTimeout>;
let revision = 0;
function check(body = request.value) {
  const id = ++revision;
  clearTimeout(timer);
  step.value = 1;
  plan.value = null;
  error.value = '';
  loading.value = true;
  if (missingName.value) { loading.value = false; return; }
  timer = setTimeout(async () => {
    try { const value = await movePreview(body); if (id === revision) plan.value = value; }
    catch (e) { if (id === revision) error.value = (e as Error).message; }
    finally { if (id === revision) loading.value = false; }
  }, 250);
}
watch(request, check, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { clearTimeout(timer); revision++; });
async function goToStep(value: number) {
  if (busy.value || (value === 2 && !canReview.value)) return;
  step.value = value;
  await nextTick();
  stepHeading.value?.focus();
  stepHeading.value?.closest('.modal-body')?.scrollTo({ top: 0 });
}
function close() { if (!busy.value) emit('close'); }
async function apply() {
  if (step.value !== 2 || !canReview.value || !plan.value || busy.value) return;
  try { await moveAssets(request.value, plan.value.fingerprint); emit('close'); }
  catch (e) { error.value = (e as Error).message; plan.value = null; await goToStep(1); }
}
</script>

<template>
  <AppModal :title="row ? 'Move asset' : 'Move assets'" xl stacked dialog-class="move-dialog" @close="close">
    <template #header><p class="move-subtitle" :title="subtitle">{{ subtitle }}</p></template>
    <div class="modal-body move-body">
      <template v-if="step === 1">
        <div class="move-source">
          <span class="move-source-icon"><i :class="['mdi', row && !row.directory ? 'mdi-file-outline' : 'mdi-folder-outline']" aria-hidden="true" /></span>
          <div class="move-source-details">
            <strong>{{ sourceLabel }}</strong>
            <div class="move-source-path"><span :title="sourceAbsolutePath">{{ sourcePath }}</span><button type="button" class="details-icon" aria-label="Copy source path" title="Copy the game path" @click="copy(sourceAbsolutePath)"><i class="mdi mdi-content-copy" aria-hidden="true" /></button></div>
            <p>{{ sourceHint }}</p>
          </div>
        </div>
        <section class="move-section" aria-labelledby="move-destination-heading">
          <h4 id="move-destination-heading" ref="stepHeading" tabindex="-1">Destination</h4>
          <p>Choose the folder in this game where the assets will go.</p>
          <FolderPicker v-model="target" />
        </section>
        <section v-if="canRename" class="move-section">
          <label for="move-name" class="move-field-label">{{ row?.directory ? 'Folder name' : 'File name' }}</label>
          <p id="move-name-hint">Edit a prefix or suffix.</p>
          <input id="move-name" v-model="name" class="form-control move-name" maxlength="255" autocomplete="off" required aria-describedby="move-name-hint" :aria-invalid="missingName || undefined">
          <p v-if="missingName" class="text-danger mt-2" role="alert">Enter a {{ row?.directory ? 'folder' : 'file' }} name.</p>
        </section>
        <section class="move-section" aria-labelledby="move-preview-heading">
          <h4 id="move-preview-heading">Destination preview</h4>
          <p>{{ row?.sequence ? 'The sequence keeps its template and all frames together.' : row?.directory ? 'The whole folder and its contents will go to:' : row ? 'The file will go to:' : 'The assets keep their subfolders inside:' }}</p>
          <div class="move-destination-path"><i class="mdi mdi-folder" aria-hidden="true" /><span>{{ destination }}</span></div>
        </section>
        <div v-if="plan?.blockers.length" class="alert alert-danger move-problems" role="alert">
          <strong>Resolve these issues before continuing.</strong>
          <div v-for="item in plan.blockers" :key="item.code + item.files.join()"><p>{{ item.message }}</p><small v-for="file in item.files" :key="file" :title="file">{{ relativePath(file, config?.destination) }}</small></div>
        </div>
        <div class="move-next" role="status" aria-live="polite">
          <i :class="['mdi', loading ? 'mdi-loading mdi-spin' : 'mdi-file-check-outline']" aria-hidden="true" />
          <div><strong>{{ loading ? 'Checking files and references…' : plan ? `Next: review ${changes}` : 'Choose a destination to continue' }}</strong><p>{{ plan?.warnings.length ? `${plan.warnings.length} warning${plural(plan.warnings.length)} to check in the review.` : 'You’ll see the file operations and the references that will be updated.' }}</p></div>
        </div>
      </template>
      <template v-else-if="plan">
        <section class="move-section move-review" aria-labelledby="move-review-heading">
          <h4 id="move-review-heading" ref="stepHeading" tabindex="-1">Review changes</h4>
          <p>{{ changes }}. Paths below are relative to this game's folder.</p>
          <div class="move-destination-path"><i class="mdi mdi-folder" aria-hidden="true" /><span>{{ destination }}</span></div>
          <ChangePreview :plan="plan" :root="config?.destination" hide-backup-note />
        </section>
      </template>
      <div v-if="error" class="alert alert-danger mt-3" role="alert">{{ error }} <button type="button" class="btn btn-sm btn-outline-danger" @click="check()">Check again</button></div>
    </div>
    <div class="modal-footer move-footer">
      <p class="move-backup"><i class="mdi mdi-shield-check-outline" aria-hidden="true" />A backup is saved automatically.</p>
      <div class="move-actions">
        <button v-if="step === 2" type="button" class="btn btn-light" :disabled="!!busy" @click="goToStep(1)">Back</button>
        <button type="button" class="btn btn-outline-secondary" :disabled="!!busy" @click="close">Cancel</button>
        <button v-if="step === 1" type="button" class="btn btn-primary" :disabled="!canReview || !!busy" @click="goToStep(2)">Review changes<i class="mdi mdi-arrow-right ml-2" aria-hidden="true" /></button>
        <button v-else type="button" class="btn btn-primary" :disabled="!canReview || !!busy" @click="apply">{{ busy === 'move' ? 'Applying…' : 'Apply' }}</button>
      </div>
    </div>
  </AppModal>
</template>

<style scoped>
.move-body { color: #20243a; }
.move-source { display: flex; align-items: flex-start; gap: 18px; margin-bottom: 28px; }
.move-source-icon { display: inline-flex; align-items: center; justify-content: center; width: 52px; height: 52px; flex-shrink: 0; border-radius: 9px; background: #efeffb; color: #4b49ac; font-size: 28px; }
.move-source-details { min-width: 0; flex: 1; }
.move-source-details strong { font-size: 14px; }
.move-source-path { display: flex; align-items: center; gap: 12px; margin: 5px 0; color: #606a80; font-size: 13px; }
.move-source-path > span:first-child { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.move-source p, .move-section p, .move-next p { margin: 0; color: #727b90; font-size: 13px; line-height: 1.5; }
.move-section { margin-bottom: 26px; }
.move-section h4, .move-field-label { display: block; margin: 0 0 4px; font-size: 19px; font-weight: 600; line-height: 1.3; }
.move-section > p { margin-bottom: 10px; }
.move-name { height: 42px; border-radius: 5px; font-size: 14px; }
.move-destination-path { display: flex; align-items: center; gap: 14px; font-size: 14px; }
.move-destination-path > i { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 40px; height: 38px; border-radius: 5px; background: #f3f4f8; color: #68708e; font-size: 24px; }
.move-destination-path > span { overflow-wrap: anywhere; min-width: 0; }
.move-next { display: flex; gap: 18px; align-items: center; padding: 18px 0 0; border-top: 1px solid #dfe3eb; font-size: 13px; }
.move-next > i { color: #4b49ac; font-size: 26px; }
.move-next strong { display: block; margin-bottom: 3px; color: #45447c; }
.move-problems { font-size: 13px; }
.move-problems p { margin: 5px 0 0; }
.move-problems small { display: block; overflow-wrap: anywhere; }
.move-review { margin-bottom: 0; }
.move-footer { justify-content: space-between; gap: 12px; }
.move-backup { display: flex; align-items: center; gap: 10px; margin: 0; color: #687087; font-size: 13px; }
.move-backup i { font-size: 22px; }
.move-actions { display: flex; gap: 8px; margin: 0; }
.move-actions .btn { min-height: 40px; padding: 9px 18px; border-radius: 4px; }
.move-actions .btn-primary { background: #4b49ac; border-color: #4b49ac; }
.move-actions .btn-primary:hover:not(:disabled) { background: #3e3c91; border-color: #3e3c91; }
.move-actions .btn-primary:focus { box-shadow: 0 0 0 0.2rem #4b49ac40; }
@media (max-width: 575px) {
  .move-source { gap: 10px; margin-bottom: 24px; }
  .move-source-icon { width: 38px; height: 42px; font-size: 23px; }
  .move-source-path { gap: 6px; }
  .move-section { margin-bottom: 22px; }
  .move-footer { flex-direction: column; align-items: stretch; }
  .move-backup { justify-content: center; font-size: 12px; }
  .move-actions { justify-content: flex-end; }
  .move-actions .btn { padding: 9px 12px; }
}
</style>
