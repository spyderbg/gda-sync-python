<script setup lang="ts">
import { computed } from 'vue';
import AssetThumbnail from '../components/AssetThumbnail.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { plural, size, time } from '../format';
import type { Asset } from '../types';
import { busy, copy, data, openFolder, requestSync, sourcePath, ui } from '../workspace';

const props = defineProps<{ asset: Asset }>();
const synced = computed(() => props.asset.status === 'synced');
const mipmaps = computed(() => props.asset.dimensions?.mipmaps || 1);
const note = computed(() => ({
  new: ['A fresh addition.', 'This asset hasn’t been copied to GDA yet.'],
  modified: ['A newer version is ready.', 'Sync to update the copy in GDA.'],
  synced: ['Everything looks good.', 'Source and GDA files match.'],
})[props.asset.status]);
</script>

<template>
  <aside class="card inspector" aria-label="Asset details">
    <div class="card-body">
      <div class="d-flex align-items-center justify-content-between mb-3">
        <h4 class="card-title mb-0">Asset Details</h4>
        <button type="button" class="close" aria-label="Close asset details" @click="ui.inspecting = null"><span aria-hidden="true">&times;</span></button>
      </div>
      <button type="button" class="preview-button" :aria-label="`Enlarge ${asset.name} preview`" @click="ui.expanded = true">
        <AssetThumbnail :asset="asset" :revision="data!.scannedAt" large />
        <span class="expand-preview"><i aria-hidden="true" class="mdi mdi-arrow-expand" /></span>
      </button>
      <div class="mt-4"><StatusBadge :status="asset.status" /></div>
      <h5 class="inspector-name">{{ asset.name }}</h5>
      <p class="text-muted mb-0"><i aria-hidden="true" class="mdi mdi-folder-outline" /> {{ asset.folder }}</p>
      <table class="table table-borderless detail-table">
        <tbody>
          <tr><th scope="row">File format</th><td>{{ asset.extension.toUpperCase() }}</td></tr>
          <tr><th scope="row">File size</th><td>{{ size(asset.size) }}</td></tr>
          <template v-if="asset.dimensions">
            <tr><th scope="row">Resolution</th><td>{{ asset.dimensions.width }} × {{ asset.dimensions.height }}</td></tr>
            <tr><th scope="row">Pixel format</th><td>{{ asset.dimensions.format }}</td></tr>
          </template>
          <tr><th scope="row">Last modified</th><td>{{ time(asset.modifiedAt) }}</td></tr>
        </tbody>
      </table>
      <div v-if="asset.extension === 'dds'" :class="['alert', 'dds-note', asset.preview ? 'alert-primary' : 'alert-warning']">
        <i aria-hidden="true" class="mdi mdi-image-outline" />
        <span>{{ asset.preview ? 'DDS preview supported' : 'DDS preview unavailable' }}<small>{{ mipmaps }} mip level{{ plural(mipmaps) }} · original preserved</small></span>
      </div>
      <div :class="['sync-note', { 'is-synced': synced }]">
        <i aria-hidden="true" :class="['mdi', synced ? 'mdi-check-all' : 'mdi-sync']" />
        <p>{{ note[0] }}<small>{{ note[1] }}</small></p>
      </div>
      <button type="button" class="btn btn-primary btn-block" :disabled="!!busy || synced" @click="requestSync([asset.id])">
        <i aria-hidden="true" :class="['mdi', synced ? 'mdi-check' : 'mdi-sync']" />{{ synced ? 'Already in sync' : 'Sync this asset' }}
      </button>
      <div class="d-flex justify-content-between mt-2">
        <button type="button" class="btn btn-link px-0" @click="openFolder('source', asset.id)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" />Open source</button>
        <button type="button" class="btn btn-link px-0" @click="copy(sourcePath(asset))"><i aria-hidden="true" class="mdi mdi-content-copy" />Copy path</button>
      </div>
    </div>
  </aside>
</template>
