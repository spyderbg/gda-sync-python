<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { AssetFolder, ChangePlan, MoveRequest, ReportAsset } from '../types';
import { busy, moveAssets, movePreview } from '../workspace';
import { useAssetReport } from '../composables/useAssetReport';
import AppModal from './AppModal.vue';
import ChangePreview from './ChangePreview.vue';
const props = defineProps<{ row?: ReportAsset; folder?: AssetFolder; folders?: AssetFolder[] }>();
const emit = defineEmits<{ close: [] }>();
const defaultTarget = () => {
  if (!props.row) return '';
  const path = props.row.resource.replaceAll('\\', '/').split('/');
  if (path[0] === '..') path.splice(0, 2);
  path.pop();
  return path.join('/');
};
const target = ref(defaultTarget());
const name = ref('');
const plan = ref<ChangePlan | null>(null);
const error = ref('');
const loading = ref(false);
const canRename = computed(() => !!props.row && !props.row.sequence);
const request = computed<MoveRequest>(() => ({ ...(props.row ? { assets: [props.row.id] } : { folder: props.folder!.path }),
  target: target.value, ...(name.value ? { name: name.value } : {}) }));
// Suggest folders actually used by game assets, stripping the name of the file or RTF folder.
const { report } = useAssetReport();
const suggestions = computed(() => [...new Set(['', ...(report.value?.assets ?? []).filter(row => row.scope === 'game').map(row => row.resource.replaceAll('\\', '/').split('/').slice(0, -1).join('/'))])].sort());
let timer: ReturnType<typeof setTimeout>;
let revision = 0;
watch(request, body => {
  const id = ++revision;
  clearTimeout(timer);
  plan.value = null;
  error.value = '';
  loading.value = true;
  timer = setTimeout(async () => {
    try { const value = await movePreview(body); if (id === revision) plan.value = value; }
    catch (e) { if (id === revision) error.value = (e as Error).message; }
    finally { if (id === revision) loading.value = false; }
  }, 250);
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { clearTimeout(timer); revision++; });
async function apply() {
  if (!plan.value || plan.value.blockers.length || busy.value) return;
  try { await moveAssets(request.value, plan.value.fingerprint); emit('close'); }
  catch (e) { error.value = (e as Error).message; plan.value = null; }
}
</script>

<template>
  <AppModal :title="folder?.kind === 'other-game' || row?.scope === 'other-game' ? 'Copy into this game' : 'Move assets'" xl stacked @close="emit('close')">
    <div class="modal-body">
      <p>Paths are relative to this game's folder. Files from common or another game are copied; their originals stay.</p>
      <label class="d-block">Target folder<input v-model="target" class="form-control" list="move-target-folders" placeholder="Game folder (keep the existing subfolders for a folder copy)"></label>
      <datalist id="move-target-folders"><option v-for="path in suggestions" :key="path" :value="path || '.'" /></datalist>
      <label v-if="canRename" class="d-block mt-3">New {{ row?.directory ? 'folder' : 'file' }} name (optional)<input v-model="name" class="form-control" :placeholder="row?.resource.split('/').pop()"></label>
      <p v-if="loading" class="text-muted mt-3" role="status">Checking files and references…</p>
      <p v-if="error" class="alert alert-danger mt-3" role="alert">{{ error }}</p>
      <ChangePreview v-if="plan" :plan="plan" />
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="!plan || loading || !!plan.blockers.length || !!busy" @click="apply">{{ busy === 'move' ? 'Applying…' : 'Apply' }}</button>
    </div>
  </AppModal>
</template>
