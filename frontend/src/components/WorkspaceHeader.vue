<script setup lang="ts">
import { computed } from 'vue';
import { number, size, time } from '../format';
import type { AssetCategory } from '../types';
import { assetReport, busy, config, copy, generateAssetReport, openFolder } from '../workspace';

// The asset library's header: the newest asset report with Rescan, the counts of its assets by status, which
// filter the library when clicked, and the game path.
defineProps<{ filter: 'all' | AssetCategory }>();
const emit = defineEmits<{ 'update:filter': ['all' | AssetCategory] }>();
const summary = computed(() => assetReport.value?.summary ?? null);
const problems = computed(() => (summary.value ? summary.value.missing + summary.value.invalid : 0));
</script>

<template>
  <section class="workspace-header" aria-label="Workspace summary">
    <div class="workspace-header-top">
      <div class="workspace-header-intro">
        <p class="workspace-subtitle">
          <span>Asset report:</span>
          <span class="workspace-sync-data-path">{{ assetReport?.reportPath || 'None yet' }}</span>
          <button v-if="assetReport?.reportPath" type="button" class="workspace-sync-data-copy" aria-label="Copy asset report path" title="Copy asset report path" @click="copy(assetReport.reportPath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
        </p>
      </div>
      <div class="workspace-header-actions">
        <button type="button" class="btn btn-outline-primary" :disabled="!!busy" @click="generateAssetReport">
          <i aria-hidden="true" :class="['mdi', busy === 'report' ? 'mdi-loading mdi-spin' : 'mdi-file-document-outline']" /><span>{{ busy === 'report' ? 'Generating…' : 'Rescan' }}</span>
        </button>
      </div>
    </div>

    <div v-if="summary" class="workspace-metrics">
      <button type="button" :class="['workspace-metric', { active: filter === 'all' }]" @click="emit('update:filter', 'all')">
        <span class="workspace-metric-icon total" aria-hidden="true"><i class="mdi mdi-layers-outline" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Total assets</span><span class="workspace-metric-value">{{ number(summary.assets) }}<small>{{ number(summary.available) }} available · {{ size(summary.size) }}</small></span></span>
      </button>
      <button type="button" :class="['workspace-metric', { active: filter === 'missing' || filter === 'invalid' }]" @click="emit('update:filter', summary.missing || !summary.invalid ? 'missing' : 'invalid')">
        <span class="workspace-metric-icon problems" aria-hidden="true"><i class="mdi mdi-file-alert-outline" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Cannot be loaded</span><span class="workspace-metric-value">{{ number(problems) }}<small>{{ number(summary.missing) }} missing · {{ number(summary.invalid) }} invalid</small></span></span>
      </button>
      <button type="button" :class="['workspace-metric', { active: filter === 'supplementary' }]" @click="emit('update:filter', 'supplementary')">
        <span class="workspace-metric-icon supplementary" aria-hidden="true"><i class="mdi mdi-file-question-outline" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Supplementary</span><span class="workspace-metric-value">{{ number(summary.supplementary) }}<small>in the game, in no descriptor</small></span></span>
      </button>
    </div>

    <div class="workspace-folder-strip" role="group" aria-label="Game path">
      <button type="button" class="workspace-folder" :title="config.destination" aria-label="Open Game folder" @click="openFolder('destination')">
        <i class="mdi mdi-folder-outline workspace-folder-icon" aria-hidden="true" />
        <span class="workspace-folder-label">Game path</span>
        <span class="workspace-folder-path">{{ config.destination }}</span>
        <i class="mdi mdi-open-in-new workspace-folder-open" aria-hidden="true" />
      </button>
    </div>
    <p v-if="summary" class="workspace-last-scan">Generated {{ time(summary.finishedAt) }}</p>
  </section>
</template>

<style scoped>
.workspace-header { margin-bottom: 22px; }
.workspace-header-top { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.workspace-header-intro { min-width: 0; }
.workspace-subtitle { display: flex; align-items: center; gap: 4px; margin: 0; color: #87909b; font-size: 12px; line-height: 1.5; }
.workspace-subtitle > span:first-child { flex-shrink: 0; }
.workspace-sync-data-path { min-width: 0; font-family: monospace; overflow-wrap: anywhere; }
.workspace-sync-data-copy { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #87909b; font-size: 16px; cursor: pointer; }
.workspace-sync-data-copy:hover { background: #edf7ff; color: #2196f3; }
.workspace-header-actions { display: flex; flex-shrink: 0; gap: 10px; flex-wrap: wrap; }
.workspace-header-actions .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border-radius: 7px; white-space: nowrap; }
.workspace-header-actions .btn i.mdi { display: inline-flex; flex-shrink: 0; margin: 0; font-size: 16px; line-height: 1; }
.workspace-header-actions .btn-outline-primary { background: #fff; border-color: #dce2dc; color: #5d7063; }
.workspace-header-actions .btn-outline-primary:hover:not(:disabled) { background: #f1f5f1; }
.workspace-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.workspace-metric { display: flex; position: relative; align-items: center; gap: 14px; min-width: 0; padding: 20px 18px; border: 1px solid #e0e5de; border-radius: 9px; background: #fff; color: #29383b; text-align: left; font-family: inherit; cursor: pointer; transition: border-color 0.15s; }
.workspace-metric:hover, .workspace-metric.active { border-color: #aebcac; }
.workspace-metric-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 42px; height: 44px; border-radius: 10px; font-size: 24px; }
.workspace-metric-icon.total { color: #828d70; background: #f0f2eb; }
.workspace-metric-icon.problems { color: #cc8a43; background: #fdf1e5; }
.workspace-metric-icon.supplementary { color: #8862e0; background: #f1ebfc; }
.workspace-metric-copy { display: block; min-width: 0; }
.workspace-metric-label { display: block; margin-bottom: 6px; color: #8a968d; font-size: 11px; }
.workspace-metric-value { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 9px; row-gap: 2px; font-size: 28px; font-weight: 500; line-height: 1.15; letter-spacing: -0.7px; }
.workspace-metric-value small { font-size: 10px; font-weight: 400; color: #97a098; letter-spacing: 0; line-height: 1.4; }
.workspace-folder-strip { position: relative; display: grid; gap: 16px; padding: 12px 16px; background: #f0f3ed; border: 1px solid #e0e5de; border-radius: 8px; }
.workspace-folder { display: grid; grid-template-columns: 34px 90px minmax(0, 1fr) 18px; align-items: center; gap: 12px; min-width: 0; padding: 0; background: transparent; border: 0; color: #7e896f; text-align: left; cursor: pointer; }
.workspace-folder-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 34px; height: 34px; border: 1px solid #dee5d5; border-radius: 7px; font-size: 21px; background: #e9eee1; }
.workspace-folder-label { font-size: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.4px; }
.workspace-folder-path { display: block; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-folder-open { font-size: 16px; }
.workspace-last-scan { margin: 8px 0 0; color: #929aa1; font-size: 11px; text-align: right; }
@media (max-width: 1199px) { .workspace-metric { padding: 18px 12px; gap: 10px; } .workspace-metric-value { font-size: 25px; } }
@media (max-width: 767px) {
  .workspace-header-top { flex-direction: column; align-items: flex-start; gap: 16px; }
  .workspace-metrics { grid-template-columns: 1fr; gap: 10px; }
  .workspace-metric { padding: 16px; }
}
@media (max-width: 575px) {
  .workspace-folder { grid-template-columns: 34px minmax(0, 1fr) 18px; column-gap: 10px; row-gap: 4px; }
  .workspace-folder-icon { grid-column: 1; grid-row: 1 / 3; }
  .workspace-folder-label { grid-column: 2; grid-row: 1; }
  .workspace-folder-path { grid-column: 2; grid-row: 2; }
  .workspace-folder-open { grid-column: 3; grid-row: 1 / 3; }
}
</style>
