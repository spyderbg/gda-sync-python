<script setup lang="ts">
import { ArrowUpRight, Check, CheckCheck, Copy, Folder, FolderOpen, Image, RefreshCw, X } from '@lucide/vue';
import { computed } from 'vue';
import { plural, size, time } from '../format';
import type { Asset } from '../types';
import AssetThumbnail from './AssetThumbnail.vue';
import StatusBadge from './StatusBadge.vue';

const props = defineProps<{ asset: Asset; revision: string; busy: boolean }>();
const emit = defineEmits<{ close: []; expand: []; sync: []; openSource: []; copyPath: [] }>();
const synced = computed(() => props.asset.status === 'synced');
const mipmaps = computed(() => props.asset.dimensions?.mipmaps || 1);
const headline = computed(() => ({ new: 'A fresh addition.', modified: 'A newer version is ready.', synced: 'Everything looks good.' })[props.asset.status]);
const detail = computed(() => ({
  new: 'This asset hasn’t been copied to GDA yet.', modified: 'Sync to update the copy in GDA.', synced: 'Source and GDA files match.',
})[props.asset.status]);
</script>

<template>
  <aside class="inspector" aria-label="Asset details">
    <div class="inspector-heading"><span>ASSET DETAILS</span><button class="icon-button" aria-label="Close asset details" @click="emit('close')"><X :size="15" /></button></div>
    <button class="preview-button" :aria-label="`Enlarge ${asset.name} preview`" @click="emit('expand')">
      <AssetThumbnail :asset="asset" :revision="revision" large /><span class="expand-preview"><ArrowUpRight :size="16" /></span>
    </button>
    <div class="inspector-body">
      <StatusBadge :status="asset.status" />
      <h2>{{ asset.name }}</h2>
      <span class="inspector-folder"><Folder :size="12" />{{ asset.folder }}</span>
      <div class="detail-grid">
        <div><span>FILE FORMAT</span><strong>{{ asset.extension.toUpperCase() }}</strong></div>
        <div><span>FILE SIZE</span><strong>{{ size(asset.size) }}</strong></div>
        <template v-if="asset.dimensions">
          <div><span>RESOLUTION</span><strong>{{ asset.dimensions.width }} × {{ asset.dimensions.height }}</strong></div>
          <div><span>PIXEL FORMAT</span><strong>{{ asset.dimensions.format }}</strong></div>
        </template>
      </div>
      <div class="modified-detail"><span>LAST MODIFIED</span><strong>{{ time(asset.modifiedAt) }}</strong></div>
      <div v-if="asset.extension === 'dds'" class="dds-note">
        <Image :size="15" /><span>{{ asset.preview ? 'DDS preview supported' : 'DDS preview unavailable' }}<small>{{ mipmaps }} mip level{{ plural(mipmaps) }} · original preserved</small></span>
      </div>
      <div :class="['sync-note', { 'is-synced': synced }]">
        <span><CheckCheck v-if="synced" :size="16" /><RefreshCw v-else :size="16" /></span>
        <p>{{ headline }}<small>{{ detail }}</small></p>
      </div>
      <button class="button primary inspector-sync" :disabled="busy || synced" @click="emit('sync')">
        <Check v-if="synced" :size="15" /><RefreshCw v-else :size="15" />{{ synced ? 'Already in sync' : 'Sync this asset' }}
      </button>
      <div class="inspector-links">
        <button @click="emit('openSource')"><FolderOpen :size="14" />Open source<ArrowUpRight :size="13" /></button>
        <button @click="emit('copyPath')"><Copy :size="14" />Copy path</button>
      </div>
    </div>
  </aside>
</template>
