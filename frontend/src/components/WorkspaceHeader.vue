<script setup lang="ts">
import { computed } from 'vue';
import { number, plural, size, time } from '../format';
import type { AssetCategory, AssetFolder } from '../types';
import { assetReport, busy, config, copy, generateAssetReport, openFolder, openResourceFolder } from '../workspace';

// The asset library's header: the newest asset report with Rescan, the counts of its assets by status, which
// filter the library when clicked, and the folders its assets are in, each on its own line, which filter the library
// when clicked too. A report from before version 5 lists no folders, so only the game path is shown.
const props = defineProps<{ filter: 'all' | AssetCategory; folder: string | null; folders: AssetFolder[] }>();
const emit = defineEmits<{ 'update:filter': ['all' | AssetCategory]; 'update:folder': [string | null] }>();
const FOLDER_KINDS: Record<AssetFolder['kind'], { label: string; icon: string; hint: string }> = {
  game: { label: 'Game path', icon: 'mdi-folder-outline', hint: 'The game folder' },
  shared: { label: 'Shared', icon: 'mdi-folder-network-outline', hint: 'A folder of the resources folder that holds files the game declares, such as the features it includes' },
  outside: { label: 'Outside', icon: 'mdi-folder-alert-outline', hint: 'A folder outside the resources folder, which the game cannot load from' },
};
const lines = computed<AssetFolder[]>(() => (props.folders.length ? props.folders
  : [{ path: config.value.destination, relative: '.', kind: 'game', assets: -1 }]));
const filtering = computed(() => props.folders.length > 0);
const shownPath = (item: AssetFolder) => (item.kind === 'game' ? item.path : item.relative);
function choose(item: AssetFolder) {
  if (filtering.value) emit('update:folder', props.folder === item.path ? null : item.path);
  else openFolder('destination');
}
function open(item: AssetFolder) {
  if (item.kind === 'game') openFolder('destination');
  else openResourceFolder(item.path, true);
}
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

    <div class="workspace-folder-strip" role="group" :aria-label="filtering ? 'Asset folders: show the assets of one' : 'Game path'">
      <div v-for="item in lines" :key="item.path" :class="['workspace-folder-line', { active: filtering && folder === item.path }]">
        <button type="button" class="workspace-folder" :title="`${FOLDER_KINDS[item.kind].hint}: ${item.path}`"
                :aria-label="filtering ? `Show the assets in ${shownPath(item)}` : 'Open Game folder'" :aria-pressed="filtering ? folder === item.path : undefined" @click="choose(item)">
          <i :class="['mdi', FOLDER_KINDS[item.kind].icon, 'workspace-folder-icon']" aria-hidden="true" />
          <span class="workspace-folder-label">{{ FOLDER_KINDS[item.kind].label }}</span>
          <span class="workspace-folder-path">{{ shownPath(item) }}</span>
          <span v-if="item.assets >= 0" class="workspace-folder-count">{{ number(item.assets) }} asset{{ plural(item.assets) }}</span>
        </button>
        <button v-if="filtering" type="button" class="workspace-folder-open" :title="`Open ${item.path}`"
                :aria-label="item.kind === 'game' ? 'Open Game folder' : `Open ${item.relative} folder`" @click="open(item)">
          <i class="mdi mdi-open-in-new" aria-hidden="true" />
        </button>
        <i v-else class="mdi mdi-open-in-new workspace-folder-open" aria-hidden="true" />
      </div>
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
.workspace-folder-strip { position: relative; display: grid; gap: 4px; padding: 8px 10px; background: #f0f3ed; border: 1px solid #e0e5de; border-radius: 8px; }
.workspace-folder-line { display: flex; align-items: center; gap: 8px; min-width: 0; padding: 4px 6px; border: 1px solid transparent; border-radius: 6px; }
.workspace-folder-line:hover { background: #e9eee1; }
.workspace-folder-line.active { background: #fff; border-color: #aebcac; }
.workspace-folder { display: grid; flex: 1; grid-template-columns: 34px 90px minmax(0, 1fr) auto; align-items: center; gap: 12px; min-width: 0; padding: 0; background: transparent; border: 0; color: #7e896f; text-align: left; cursor: pointer; }
.workspace-folder-count { font-size: 11px; white-space: nowrap; color: #97a098; }
.workspace-folder-line.active .workspace-folder-count, .workspace-folder-line.active .workspace-folder-path { color: #29383b; }
.workspace-folder-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 34px; height: 34px; border: 1px solid #dee5d5; border-radius: 7px; font-size: 21px; background: #e9eee1; }
.workspace-folder-label { font-size: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.4px; }
.workspace-folder-path { display: block; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-folder-open { display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; width: 28px; height: 28px; padding: 0; border: 0; border-radius: 4px; background: transparent; color: #7e896f; font-size: 16px; cursor: pointer; }
button.workspace-folder-open:hover { background: #dfe6d6; color: #29383b; }
.workspace-last-scan { margin: 8px 0 0; color: #929aa1; font-size: 11px; text-align: right; }
@media (max-width: 1199px) { .workspace-metric { padding: 18px 12px; gap: 10px; } .workspace-metric-value { font-size: 25px; } }
@media (max-width: 767px) {
  .workspace-header-top { flex-direction: column; align-items: flex-start; gap: 16px; }
  .workspace-metrics { grid-template-columns: 1fr; gap: 10px; }
  .workspace-metric { padding: 16px; }
}
@media (max-width: 575px) {
  .workspace-folder { grid-template-columns: 34px minmax(0, 1fr) auto; column-gap: 10px; row-gap: 4px; }
  .workspace-folder-icon { grid-column: 1; grid-row: 1 / 3; }
  .workspace-folder-label { grid-column: 2; grid-row: 1; }
  .workspace-folder-path { grid-column: 2 / 4; grid-row: 2; }
  .workspace-folder-count { grid-column: 3; grid-row: 1; }
}
</style>
