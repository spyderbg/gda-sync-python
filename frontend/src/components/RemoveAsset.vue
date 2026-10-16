<script setup lang="ts">
import { computed } from 'vue';
import { declarationLabel, plural, splitPath } from '../format';
import type { ReportAsset } from '../types';
import { busy, removeAsset } from '../workspace';
import AppModal from './AppModal.vue';

// Confirm removing an asset of the asset report from the game: its files are deleted, and the entries that declare it, its
// RssKeys, are removed from the descriptors. Each file and descriptor is saved in the backups first, and the backup also
// keeps each entry as it was, so that restoring it brings the same entry back.
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
const shownFiles = computed(() => files.value.slice(0, 6));
// A descriptor outside the game folder, such as a common one, can be included by other games.
const shared = computed(() => props.row.requiredBy.some(use => use.descriptor.startsWith('..')));

async function remove() {
  if (busy.value) return;
  if (await removeAsset(props.row.id)) emit('close');
}
</script>

<template>
  <AppModal :title="`Remove ${name}?`" stacked @close="emit('close')">
    <div class="modal-body">
      <p v-if="files.length" class="mb-2">Delete {{ files.length === 1 ? 'this file' : `these ${files.length} files` }} from the game folder:</p>
      <ul v-if="files.length" class="list-group sync-file-list mb-3">
        <li v-for="file in shownFiles" :key="file" class="list-group-item"><i aria-hidden="true" class="mdi mdi-file-outline text-muted" /><span>{{ file }}</span></li>
        <li v-if="files.length > shownFiles.length" class="list-group-item text-muted">and {{ files.length - shownFiles.length }} more</li>
      </ul>
      <template v-if="row.requiredBy.length">
        <p class="mb-2">Remove {{ row.requiredBy.length === 1 ? 'its RssKey' : `its ${row.requiredBy.length} RssKeys` }} from the descriptors:</p>
        <ul class="list-group sync-file-list mb-3">
          <li v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="list-group-item"><i aria-hidden="true" class="mdi mdi-code-json text-muted" /><span>{{ declarationLabel(use) }}</span></li>
        </ul>
        <p v-if="shared" class="text-warning">A descriptor outside the game folder declares it, which other games can include.</p>
      </template>
      <p v-if="!files.length && !row.requiredBy.length" class="text-muted">Nothing is left to remove. Rescan to update the report.</p>
      <p class="mb-0 text-muted">Each file and descriptor is saved in your backups first. Restoring that backup puts the files back and each RssKey as it was.</p>
    </div>
    <div class="modal-footer">
      <button type="button" class="btn btn-light" @click="emit('close')">Cancel</button>
      <button type="button" class="btn btn-danger" :disabled="!!busy || (!files.length && !row.requiredBy.length)" @click="remove">
        <i aria-hidden="true" :class="['mdi', busy === 'remove' ? 'mdi-loading mdi-spin' : 'mdi-trash-can-outline']" />{{ busy === 'remove' ? 'Removing…' : 'Remove' }}
      </button>
    </div>
  </AppModal>
</template>
