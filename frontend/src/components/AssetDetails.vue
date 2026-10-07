<script setup lang="ts">
import { computed } from 'vue';
import { size, time } from '../format';
import type { Asset } from '../types';
import { copy, gamePath, openFolder } from '../workspace';
import AppModal from './AppModal.vue';
import AssetThumbnail from './AssetThumbnail.vue';
import AudioPreview from './AudioPreview.vue';

// The details of one file of the game folder in a dialog, like the details of a GDA sync report resource: a large
// preview, its path with buttons to copy it or open its folder, and its format, size, resolution, pixel format, mip
// levels and time. An audio file plays once when the dialog opens. Escape closes the dialog.
const props = defineProps<{ asset: Asset; revision: string }>();
const emit = defineEmits<{ close: [] }>();

const file = computed(() => gamePath(props.asset));
const table = computed(() => {
  const { asset } = props;
  const dimensions = asset.dimensions;
  return [
    { label: 'File format', value: asset.extension.toUpperCase() || '—' },
    { label: 'File size', value: size(asset.size) },
    ...(dimensions ? [
      { label: 'Resolution', value: `${dimensions.width} × ${dimensions.height}` },
      { label: 'Pixel format', value: dimensions.format },
      ...(dimensions.mipmaps ? [{ label: 'Mip levels', value: String(dimensions.mipmaps) }] : []),
    ] : []),
    { label: 'Last modified', value: time(asset.modifiedAt) },
  ];
});
</script>

<template>
  <AppModal :title="asset.name" xl @close="emit('close')">
    <div class="modal-body details-dialog asset-details">
      <div class="details-previews">
        <figure class="details-preview">
          <figcaption>Game file</figcaption>
          <AudioPreview v-if="asset.type === 'audio'" :file="file" :name="asset.name" :revision="revision" autoplay />
          <AssetThumbnail v-else :asset="asset" :revision="revision" large />
        </figure>
      </div>

      <div class="details-columns">
        <section class="details-summary" aria-label="Location">
          <h5 class="details-name" :title="file">{{ asset.name }}</h5>
          <p class="details-folder text-muted"><i aria-hidden="true" class="mdi mdi-folder-outline" /> {{ asset.folder }}</p>
          <p v-if="asset.extension === 'dds'" class="details-scope text-muted">
            <i aria-hidden="true" class="mdi mdi-image-outline" /> {{ asset.preview ? 'DDS preview supported' : 'DDS preview unavailable' }} · original unchanged
          </p>

          <h6 class="details-heading">Game path</h6>
          <div class="details-path">
            <span class="details-code" :title="file">{{ file }}</span>
            <button type="button" class="details-icon" :aria-label="`Copy the game path ${file}`" title="Copy the game path" @click="copy(file)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
            <button type="button" class="details-icon" :aria-label="`Open the game folder of ${asset.name}`" title="Open the game folder" @click="openFolder('destination', asset.id)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
          </div>
        </section>

        <section class="details-facts" aria-label="File details">
          <h6 class="details-heading mt-0">File</h6>
          <table class="table details-table">
            <tbody>
              <tr v-for="item in table" :key="item.label"><th scope="row">{{ item.label }}</th><td>{{ item.value }}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
    </div>
    <div class="modal-footer details-footer">
      <span class="text-muted">{{ asset.path }}</span>
      <button type="button" class="btn btn-light" @click="emit('close')">Close</button>
    </div>
  </AppModal>
</template>
