<script setup lang="ts">
import { computed, ref } from 'vue';
import { assetBadges, number, plural, splitPath, viewSummary } from '../format';
import type { ReportAsset, ViewLayer } from '../types';
import AppModal from './AppModal.vue';
import ViewPreview from './ViewPreview.vue';

// Several views of the asset report in one dialog, drawn on one screen as the game shows them together: each in the
// order it was selected, the first at the bottom, with the large view preview's layers to hide and reorder them, and a
// table of the views. Only views open together; any other asset opens on its own. Escape closes the dialog.
const props = defineProps<{ rows: ReportAsset[]; revision: string }>();
const emit = defineEmits<{ close: [] }>();

const nameOf = (row: ReportAsset) => splitPath(row.resource).name.replace(/\.json$/i, '');
const layers = computed<ViewLayer[]>(() => props.rows.flatMap(row => (row.view ? [{ file: row.resourcePath, name: nameOf(row), facts: row.view }] : [])));
const first = computed(() => layers.value[0]);
// The views' elements can be moved; closing with moves that are not saved asks first.
const unsaved = ref(false);
function close() {
  if (unsaved.value && !window.confirm('Discard the elements you moved without saving them?')) return;
  emit('close');
}
</script>

<template>
  <AppModal :title="`${number(layers.length)} views`" xl @close="close">
    <div class="modal-body details-dialog asset-details">
      <div class="details-previews">
        <figure class="details-preview">
          <figcaption>Views, as the game draws them together</figcaption>
          <ViewPreview v-if="first" :file="first.file" :name="first.name" :revision="revision" :facts="first.facts" :layers="layers" large editable @dirty="unsaved = $event" />
        </figure>
      </div>
      <section class="details-facts" aria-label="Views">
        <h6 class="details-heading mt-0">Views, in the order they are drawn</h6>
        <table class="table table-sm details-table views-details-table">
          <thead><tr><th scope="col">#</th><th scope="col">View</th><th scope="col">Folder</th><th scope="col">Screen</th><th scope="col">Elements</th><th scope="col">Status</th></tr></thead>
          <tbody>
            <tr v-for="(row, index) in rows" :key="row.id">
              <td class="text-muted">{{ index + 1 }}</td>
              <td class="details-code" :title="row.resourcePath">{{ nameOf(row) }}<small v-if="row.view && row.view.name !== nameOf(row)" class="text-muted"> {{ row.view.name }}</small></td>
              <td class="details-code text-muted">{{ splitPath(row.resource).folder }}</td>
              <td class="text-nowrap">{{ row.view ? `${row.view.resolution.width} × ${row.view.resolution.height}` : '—' }}</td>
              <td>{{ row.view ? viewSummary(row.view) : '—' }}<span v-if="row.view?.missingCount" class="text-danger"> · {{ number(row.view.missingCount) }} without resource{{ plural(row.view.missingCount) }}</span></td>
              <td><span :class="['badge', assetBadges[row.category]]">{{ row.category }}</span></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
    <div class="modal-footer details-footer">
      <span class="text-muted">{{ layers.map(layer => layer.name).join(' · ') }}</span>
      <button type="button" class="btn btn-light" @click="close">Close</button>
    </div>
  </AppModal>
</template>

<style scoped>
.views-details-table th, .views-details-table td { width: auto; }
</style>
