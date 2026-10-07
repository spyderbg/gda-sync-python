<script setup lang="ts">
import { ago, size, time, typeIcons } from '../format';
import type { Asset } from '../types';
import AssetThumbnail from './AssetThumbnail.vue';

// One file of the game folder as a card: preview, name, folder, size, when it changed, and its dimensions or format. The
// card's look comes from the global .asset-card styles. Clicking it emits open; the actions slot adds buttons under the
// card's details.
withDefaults(defineProps<{
  asset: Asset;
  revision: string;
  inspected?: boolean;
  /** The accessible name of the card's main button. */
  openLabel?: string;
  /** Whether the round "details" button shows when the card is hovered. */
  menu?: boolean;
}>(), { inspected: false, openLabel: undefined, menu: true });
const emit = defineEmits<{ open: [] }>();

const dimensions = (asset: Asset) => (asset.dimensions ? `${asset.dimensions.width} × ${asset.dimensions.height}` : asset.extension.toUpperCase());
</script>

<template>
  <article :class="['card', 'asset-card', { inspected }]">
    <button type="button" class="asset-hit-target" :aria-label="openLabel ?? `Inspect ${asset.name}`" @click="emit('open')">
      <AssetThumbnail :asset="asset" :revision="revision" />
      <div class="card-body">
        <p class="asset-name"><i aria-hidden="true" :class="['mdi', typeIcons[asset.type]]" /><span :title="asset.name">{{ asset.name }}</span></p>
        <p class="asset-meta"><span :title="asset.path">{{ asset.folder }}</span><span>{{ size(asset.size) }}</span></p>
        <div class="asset-footer"><small class="text-muted" :title="time(asset.modifiedAt)">{{ ago(asset.modifiedAt) }}</small><small>{{ dimensions(asset) }}</small></div>
      </div>
    </button>
    <div v-if="$slots.actions" class="asset-actions"><slot name="actions" /></div>
    <button v-if="menu" type="button" class="asset-menu" :aria-label="`Show details for ${asset.name}`" @click="emit('open')"><i aria-hidden="true" class="mdi mdi-dots-horizontal" /></button>
  </article>
</template>

<style scoped>
.asset-actions { display: flex; gap: 4px; padding: 6px 10px; border-top: 1px solid #ebedf2; }
</style>
