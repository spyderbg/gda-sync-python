<script setup lang="ts">
import { computed, onMounted, ref } from 'vue';
import { declarationLabel, plural, splitPath } from '../format';
import type { AssetUse, ReportAsset } from '../types';
import { assetUses, busy, removeAsset, ui } from '../workspace';
import AppModal from './AppModal.vue';

// Confirm removing an asset of the asset report: its files in the game folder are deleted, and the entries that declare
// it, its RssKeys, are removed from the descriptors. A file outside the game folder, such as in the common folder, stays:
// other games share it. Each file and descriptor is saved in the backups first, and the backup also keeps each entry with
// its fields, so that restoring it brings the same entry back; an asset without RssKeys is kept there by its path. When
// views use its RssKeys, a second confirmation lists them, each opening its details.
const props = defineProps<{ row: ReportAsset }>();
const emit = defineEmits<{ close: [] }>();

const name = computed(() => splitPath(props.row.resource).name);
// The files of the asset that exist, each once: a sequence's frames, an RTF's folder's files, or its file.
const files = computed(() => {
  const found = props.row.sequence ? props.row.sequence.frames : props.row.directory ? props.row.directory.files : [props.row];
  const known = new Map<string, boolean>();
  for (const file of found) known.set(file.resourcePath, 'size' in file && file.size !== undefined);
  return [...known].filter(([, exists]) => exists).map(([path]) => splitPath(path).name);
});
// Only the files of the game folder are deleted.
const deleted = computed(() => (props.row.scope === 'game' ? files.value : []));
const shownFiles = computed(() => deleted.value.slice(0, 6));
const keys = computed(() => props.row.requiredBy.length);
// A descriptor outside the game folder, such as a common one, can be included by other games.
const sharedDescriptor = computed(() => props.row.requiredBy.some(use => use.descriptor.startsWith('..')));
const nothing = computed(() => !deleted.value.length && !keys.value);

// The views that use its RssKeys, read when the dialog opens.
const uses = ref<AssetUse[] | null>(null);
const usesError = ref('');
const confirming = ref(false);
const usedIds = computed(() => [...new Set((uses.value ?? []).flatMap(view => view.elements.flatMap(element => element.keys)))]);

onMounted(async () => {
  if (!keys.value) { uses.value = []; return; }
  try { uses.value = await assetUses(props.row.id); } catch (e) { usesError.value = (e as Error).message; uses.value = []; }
});

async function remove() {
  if (busy.value || uses.value === null) return;
  if (uses.value.length && !confirming.value) { confirming.value = true; return; }
  if (await removeAsset(props.row.id, confirming.value)) emit('close');
}

function open(view: AssetUse) {
  if (!view.asset) return;
  emit('close');
  ui.inspecting = view.asset;
}
</script>

<template>
  <AppModal v-if="!confirming" :title="`Remove ${name}?`" stacked @close="emit('close')">
    <div class="modal-body">
      <p v-if="deleted.length" class="mb-2">Delete {{ deleted.length === 1 ? 'this file' : `these ${deleted.length} files` }} from the game folder:</p>
      <ul v-if="deleted.length" class="list-group sync-file-list mb-3">
        <li v-for="file in shownFiles" :key="file" class="list-group-item"><i aria-hidden="true" class="mdi mdi-file-outline text-muted" /><span>{{ file }}</span></li>
        <li v-if="deleted.length > shownFiles.length" class="list-group-item text-muted">and {{ deleted.length - shownFiles.length }} more</li>
      </ul>
      <p v-if="row.scope !== 'game' && files.length" class="text-muted">
        {{ files.length === 1 ? 'Its file stays' : `Its ${files.length} files stay` }}: {{ row.scope === 'common' ? 'the common folder' : 'a folder outside the game' }}
        holds {{ files.length === 1 ? 'it' : 'them' }}, which other games share.
      </p>
      <template v-if="keys">
        <p class="mb-2">Remove {{ keys === 1 ? 'its RssKey' : `its ${keys} RssKeys` }} from the descriptors:</p>
        <ul class="list-group sync-file-list mb-3">
          <li v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="list-group-item"><i aria-hidden="true" class="mdi mdi-code-json text-muted" /><span>{{ declarationLabel(use) }}</span></li>
        </ul>
        <p v-if="sharedDescriptor" class="text-warning">A descriptor outside the game folder declares it, which other games can include.</p>
        <p v-if="uses === null" class="text-muted remove-uses"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Checking which views use {{ keys === 1 ? 'it' : 'them' }}…</p>
        <p v-else-if="usesError" class="text-danger remove-uses">The views could not be checked: {{ usesError }}</p>
        <p v-else-if="uses.length" class="text-warning remove-uses"><i aria-hidden="true" class="mdi mdi-alert-outline" /> {{ uses.length }} view{{ plural(uses.length) }} use{{ uses.length === 1 ? 's' : '' }} {{ keys === 1 ? 'it' : 'them' }}.</p>
        <p v-else class="text-muted remove-uses">No view uses {{ keys === 1 ? 'it' : 'them' }}.</p>
      </template>
      <p v-if="nothing" class="text-muted">Nothing is left to remove. Rescan to update the report.</p>
      <p v-if="keys" class="mb-0 text-muted">Each file and descriptor is saved in your backups first, with each RssKey and its fields. Restoring that backup puts the files back and each RssKey as it was.</p>
      <p v-else-if="!nothing" class="mb-0 text-muted">The file is saved in your backups first. Restoring that backup puts it back at its path.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-danger" :disabled="!!busy || nothing || uses === null" @click="remove">
        <i aria-hidden="true" :class="['mdi', busy === 'remove' ? 'mdi-loading mdi-spin' : 'mdi-trash-can-outline']" />{{ busy === 'remove' ? 'Removing…' : 'Remove' }}
      </button>
    </div>
  </AppModal>
  <AppModal v-else :title="usedIds.length === 1 ? `${usedIds[0]} is in use` : 'Its RssKeys are in use'" stacked @close="confirming = false">
    <div class="modal-body">
      <p class="mb-2">
        {{ uses!.length === 1 ? 'This view uses' : `These ${uses!.length} views use` }} {{ usedIds.length === 1 ? 'the RssKey' : 'the RssKeys' }} of {{ name }}.
        Removing {{ name }} leaves {{ uses!.length === 1 ? 'it' : 'them' }} without {{ usedIds.length === 1 ? 'that resource' : 'those resources' }}:
      </p>
      <ul class="list-group remove-views mb-3">
        <li v-for="view in uses!" :key="view.path" class="list-group-item">
          <i aria-hidden="true" class="mdi mdi-view-dashboard-outline text-muted" />
          <div class="remove-view">
            <button v-if="view.asset" type="button" class="btn btn-link p-0 remove-view-link" :title="view.path" @click="open(view)">{{ view.name }}</button>
            <span v-else :title="view.path">{{ view.name }}</span>
            <small class="text-muted d-block">{{ view.resource }}</small>
            <small class="d-block remove-view-elements">
              <template v-for="(element, index) in view.elements" :key="element.index">{{ index ? ', ' : '' }}<code>{{ element.id || `#${element.index}` }}</code> ({{ element.type }}<template v-if="usedIds.length > 1">: {{ element.keys.join(', ') }}</template>)</template>
            </small>
          </div>
        </li>
      </ul>
      <p class="mb-0 text-muted">The removed RssKeys are kept in your backups, so restoring the backup gives the views their resources back.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="confirming = false">Back</button>
      <button type="button" class="btn btn-danger" :disabled="!!busy" @click="remove">
        <i aria-hidden="true" :class="['mdi', busy === 'remove' ? 'mdi-loading mdi-spin' : 'mdi-trash-can-outline']" />{{ busy === 'remove' ? 'Removing…' : 'Remove anyway' }}
      </button>
    </div>
  </AppModal>
</template>

<style scoped>
.remove-uses { display: flex; gap: 6px; align-items: baseline; }
.remove-views { max-height: 320px; overflow-y: auto; }
.remove-views .list-group-item { display: flex; align-items: flex-start; gap: 10px; padding: 8px 12px; font-size: 0.8125rem; }
.remove-views .mdi { margin-top: 2px; }
.remove-view { min-width: 0; overflow-wrap: anywhere; }
.remove-view-elements { margin-top: 2px; }
.remove-view-link { font-weight: 600; text-align: left; }
</style>
