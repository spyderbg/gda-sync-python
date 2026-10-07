<script setup lang="ts">
import { computed } from 'vue';
import { ago, number, plural, size, time } from '../format';
import { assets, busy, config, copy, data, navigate, openFolder, rescan, rssSync, totalSize, ui } from '../workspace';

// The asset library browses the game folder: how many files it has, their size and formats, and the newest change.
const formats = computed(() => {
  const counts = new Map<string, number>();
  for (const { extension } of assets.value) counts.set(extension, (counts.get(extension) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1]).map(([extension]) => extension.toUpperCase() || 'No extension');
});
// The backend lists the newest files first.
const newest = computed(() => assets.value[0] ?? null);
</script>

<template>
  <section class="workspace-header" aria-label="Workspace summary">
    <div class="workspace-header-top">
      <div class="workspace-header-intro">
        <p class="workspace-subtitle">
          <span>Sync data:</span>
          <span class="workspace-sync-data-path">{{ rssSync?.reportPath || 'Unavailable' }}</span>
          <button v-if="rssSync?.reportPath" type="button" class="workspace-sync-data-copy" aria-label="Copy sync report path" title="Copy sync report path" @click="copy(rssSync.reportPath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
        </p>
      </div>
      <div class="workspace-header-actions">
        <button type="button" class="btn btn-outline-primary" :disabled="!!busy" @click="rescan">
          <i aria-hidden="true" :class="['mdi', busy === 'scan' ? 'mdi-loading mdi-spin' : 'mdi-refresh']" /><span>{{ busy === 'scan' ? 'Scanning…' : 'Rescan' }}</span>
        </button>
      </div>
    </div>

    <div class="workspace-metrics">
      <button type="button" class="workspace-metric" @click="navigate('library')">
        <span class="workspace-metric-icon total" aria-hidden="true"><i class="mdi mdi-layers-outline" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Total assets</span><span class="workspace-metric-value">{{ number(assets.length) }}<small>in the game path</small></span></span>
        <i class="mdi mdi-arrow-top-right workspace-metric-arrow" aria-hidden="true" />
      </button>
      <div class="workspace-metric is-static">
        <span class="workspace-metric-icon size" aria-hidden="true"><i class="mdi mdi-harddisk" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Total size</span><span class="workspace-metric-value">{{ size(totalSize) }}<small :title="formats.join(', ')">{{ number(formats.length) }} format{{ plural(formats.length) }}<template v-if="formats.length"> · {{ formats.slice(0, 3).join(' · ') }}</template></small></span></span>
      </div>
      <button type="button" class="workspace-metric" :disabled="!newest" @click="newest && (ui.inspecting = newest.id)">
        <span class="workspace-metric-icon recent" aria-hidden="true"><i class="mdi mdi-clock-outline" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Last changed</span><span class="workspace-metric-value">{{ newest ? ago(newest.modifiedAt) : '—' }}<small v-if="newest" :title="newest.path">{{ newest.name }}</small></span></span>
        <i v-if="newest" class="mdi mdi-arrow-top-right workspace-metric-arrow" aria-hidden="true" />
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
    <p class="workspace-last-scan">Last scanned {{ time(data!.scannedAt) }}</p>
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
.workspace-header-actions .btn-outline-primary:hover { background: #f1f5f1; }
.workspace-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.workspace-metric { display: flex; position: relative; align-items: center; gap: 14px; min-width: 0; padding: 20px 18px; border: 1px solid #e0e5de; border-radius: 9px; background: #fff; color: #29383b; text-align: left; font-family: inherit; cursor: pointer; transition: border-color 0.15s; }
.workspace-metric:hover:not(:disabled):not(.is-static) { border-color: #aebcac; }
.workspace-metric.is-static, .workspace-metric:disabled { cursor: default; }
.workspace-metric-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 42px; height: 44px; border-radius: 10px; font-size: 24px; }
.workspace-metric-icon.total { color: #828d70; background: #f0f2eb; }
.workspace-metric-icon.size { color: #5b86b8; background: #e9f1fa; }
.workspace-metric-icon.recent { color: #80a263; background: #edf4e6; }
.workspace-metric-copy { display: block; min-width: 0; }
.workspace-metric-label { display: block; margin-bottom: 6px; color: #8a968d; font-size: 11px; }
.workspace-metric-value { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 9px; row-gap: 2px; font-size: 28px; font-weight: 500; line-height: 1.15; letter-spacing: -0.7px; }
.workspace-metric-value small { font-size: 10px; font-weight: 400; color: #97a098; letter-spacing: 0; line-height: 1.4; }
.workspace-metric-arrow { position: absolute; right: 14px; top: 14px; color: #a5b199; font-size: 17px; }
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
