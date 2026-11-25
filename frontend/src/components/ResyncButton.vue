<script setup lang="ts">
import { computed } from 'vue';
import { activeSyncCount, busy, rescan } from '../workspace';

const comparing = computed(() => busy.value === 'scan' || activeSyncCount.value > 0);
</script>

<template>
  <button type="button" class="btn btn-outline-primary resync-outline" :disabled="!!busy || comparing" @click="rescan">
    <i aria-hidden="true" :class="['mdi', comparing ? 'mdi-loading mdi-spin' : 'mdi-refresh']" />
    <span>{{ comparing ? 'Comparing…' : 'Re-sync' }}</span>
  </button>
</template>

<style scoped>
.btn.resync-outline { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border-radius: 7px; white-space: nowrap; background: #fff; border-color: #dce2dc; color: #5d7063; }
.resync-outline i.mdi { display: inline-flex; flex-shrink: 0; margin: 0; font-size: 16px; line-height: 1; }
.resync-outline:hover:not(:disabled) { background: #f1f5f1; }
</style>
