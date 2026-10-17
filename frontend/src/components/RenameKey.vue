<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { ChangePlan, RenameKeyRequest } from '../types';
import { busy, renameKey, renameKeyPreview } from '../workspace';
import AppModal from './AppModal.vue';
import ChangePreview from './ChangePreview.vue';
const props = defineProps<{ kind: string; rssKey: string }>();
const emit = defineEmits<{ close: [] }>();
const newKey = ref(props.rssKey);
const excluded = ref<string[]>([]);
const plan = ref<ChangePlan | null>(null);
const error = ref('');
const loading = ref(false);
const request = computed<RenameKeyRequest>(() => ({ kind: props.kind, key: props.rssKey, newKey: newKey.value, excluded: excluded.value }));
let timer: ReturnType<typeof setTimeout>;
let revision = 0;
watch(request, body => {
  const id = ++revision;
  clearTimeout(timer); plan.value = null; error.value = ''; loading.value = true;
  timer = setTimeout(async () => {
    try { const value = await renameKeyPreview(body); if (id === revision) plan.value = value; }
    catch (e) { if (id === revision) error.value = (e as Error).message; }
    finally { if (id === revision) loading.value = false; }
  }, 250);
}, { immediate: true, flush: 'sync' });
onBeforeUnmount(() => { clearTimeout(timer); revision++; });
function toggle(id: string, selected: boolean) { excluded.value = selected ? excluded.value.filter(value => value !== id) : [...excluded.value, id]; }
async function apply() {
  if (!plan.value || plan.value.blockers.length || busy.value) return;
  try { await renameKey(request.value, plan.value.fingerprint); emit('close'); }
  catch (e) { error.value = (e as Error).message; plan.value = null; }
}
</script>

<template>
  <AppModal :title="`Rename ${rssKey}`" xl stacked @close="emit('close')">
    <div class="modal-body">
      <p>{{ kind }} · Every variant of this key is renamed. Review the optional JSON value matches below.</p>
      <label class="d-block">New RssKey<input v-model="newKey" class="form-control" maxlength="200" autocomplete="off"></label>
      <p v-if="loading" class="text-muted mt-3" role="status">Checking references…</p>
      <p v-if="error" class="alert alert-danger mt-3" role="alert">{{ error }}</p>
      <ChangePreview v-if="plan" :plan="plan" @toggle="toggle" />
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-primary" :disabled="!plan || loading || !!plan.blockers.length || !!busy" @click="apply">{{ busy === 'rename' ? 'Applying…' : 'Apply' }}</button>
    </div>
  </AppModal>
</template>
