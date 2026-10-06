<script setup lang="ts">
import { size, typeIcons } from '../format';
import type { Asset } from '../types';
import AssetThumbnail from './AssetThumbnail.vue';
import CheckBox from './CheckBox.vue';
import StatusBadge from './StatusBadge.vue';

// One asset as a card: preview, name, folder, size, status, and a check box to select it. The card's look comes from the
// global .asset-card styles. Clicking it emits open; the actions slot adds buttons under the card's details.
withDefaults(defineProps<{
  asset: Asset;
  revision: string;
  selected?: boolean;
  inspected?: boolean;
  /** The accessible name of the card's main button. */
  openLabel?: string;
  /** Whether the round "details" button shows when the card is hovered. */
  menu?: boolean;
}>(), { selected: false, inspected: false, openLabel: undefined, menu: true });
const emit = defineEmits<{ open: []; toggle: [] }>();

const dimensions = (asset: Asset) => (asset.dimensions ? `${asset.dimensions.width} × ${asset.dimensions.height}` : asset.extension.toUpperCase());
</script>

<template>
  <article :class="['card', 'asset-card', { inspected, selected }]">
    <button type="button" class="asset-hit-target" :aria-label="openLabel ?? `Inspect ${asset.name}`" @click="emit('open')">
      <AssetThumbnail :asset="asset" :revision="revision" />
      <div class="card-body">
        <p class="asset-name"><i aria-hidden="true" :class="['mdi', typeIcons[asset.type]]" /><span :title="asset.name">{{ asset.name }}</span></p>
        <p class="asset-meta"><span :title="asset.path">{{ asset.folder }}</span><span>{{ size(asset.size) }}</span></p>
        <div class="asset-footer"><StatusBadge :status="asset.status" /><small>{{ dimensions(asset) }}</small></div>
      </div>
    </button>
    <div v-if="$slots.actions" class="asset-actions"><slot name="actions" /></div>
    <CheckBox class="asset-check" :checked="selected" :label="`Select ${asset.name}`" @change="emit('toggle')" />
    <button v-if="menu" type="button" class="asset-menu" :aria-label="`Show details for ${asset.name}`" @click="emit('open')"><i aria-hidden="true" class="mdi mdi-dots-horizontal" /></button>
  </article>
</template>

<style scoped>
.asset-actions { display: flex; gap: 4px; padding: 6px 10px; border-top: 1px solid #ebedf2; }
</style>
