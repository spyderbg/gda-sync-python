<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(defineProps<{ workspaceId?: string; size?: number }>(), { size: 42 });
const icons = new Set([
  'burning_crown_tetra_spins_10', 'burning_hot_coins', 'joker_reels_coins_10',
  'nordic_tale', 'super_hot_coins_20',
]);
const source = computed(() => props.workspaceId && icons.has(props.workspaceId)
  ? `/icons/workspaces/${props.workspaceId}.png` : undefined);
</script>

<template>
  <span class="workspace-icon" :style="{ width: `${size}px`, height: `${size}px` }" aria-hidden="true">
    <img v-if="source" :src="source" alt="" :width="size" :height="size">
    <i v-else class="mdi mdi-gamepad-variant-outline" />
  </span>
</template>

<style scoped>
.workspace-icon { display: inline-grid; place-items: center; flex-shrink: 0; overflow: hidden; border-radius: 10px; background: #edf4fe; color: #2277cf; font-size: 25px; vertical-align: middle; }
.workspace-icon img { display: block; width: 100%; height: 100%; object-fit: cover; }
</style>
