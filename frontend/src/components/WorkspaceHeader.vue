<script setup lang="ts">
import { computed } from 'vue';
import { number, time } from '../format';
import { assets, busy, config, data, navigate, openFolder, pending, requestSync, rescan, syncedCount } from '../workspace';

const newCount = computed(() => pending.value.filter(asset => asset.status === 'new').length);
const modifiedCount = computed(() => pending.value.length - newCount.value);
</script>

<template>
  <section class="workspace-header" aria-labelledby="workspace-heading">
    <div class="workspace-header-top">
      <div class="workspace-header-intro">
        <p class="workspace-eyebrow">Your creative workflow, connected</p>
        <h1 id="workspace-heading">{{ config.name }}<span class="workspace-title-dot">.</span></h1>
        <p class="workspace-subtitle">A place for every asset. Everything in its right place.</p>
      </div>
      <div class="workspace-header-actions">
        <button type="button" class="btn btn-outline-primary" :disabled="!!busy" @click="rescan">
          <i aria-hidden="true" :class="['mdi', busy === 'scan' ? 'mdi-loading mdi-spin' : 'mdi-refresh']" />{{ busy === 'scan' ? 'Scanning…' : 'Rescan' }}
        </button>
        <button type="button" class="btn btn-primary" :disabled="!!busy || !pending.length" @click="requestSync(pending.map(asset => asset.id))">
          <i aria-hidden="true" :class="['mdi', busy === 'sync' ? 'mdi-loading mdi-spin' : 'mdi-sync']" />{{ busy === 'sync' ? 'Syncing…' : 'Sync all pending' }}<span v-if="pending.length" class="badge badge-light ml-2">{{ number(pending.length) }}</span>
        </button>
      </div>
    </div>

    <div class="workspace-metrics">
      <button type="button" class="workspace-metric" @click="navigate('library')">
        <span class="workspace-metric-icon total" aria-hidden="true"><i class="mdi mdi-layers-outline" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Total assets</span><span class="workspace-metric-value">{{ number(assets.length) }}<small>in your workspace</small></span></span>
        <i class="mdi mdi-arrow-top-right workspace-metric-arrow" aria-hidden="true" />
      </button>
      <button type="button" class="workspace-metric" @click="navigate('pending')">
        <span class="workspace-metric-icon pending" aria-hidden="true"><i class="mdi mdi-sync" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Ready to sync</span><span class="workspace-metric-value">{{ number(pending.length) }}<small>{{ number(newCount) }} new · {{ number(modifiedCount) }} modified</small></span></span>
        <i class="mdi mdi-arrow-top-right workspace-metric-arrow" aria-hidden="true" />
      </button>
      <button type="button" class="workspace-metric" @click="navigate('synced')">
        <span class="workspace-metric-icon synced" aria-hidden="true"><i class="mdi mdi-check-all" /></span>
        <span class="workspace-metric-copy"><span class="workspace-metric-label">Already in sync</span><span class="workspace-metric-value">{{ number(syncedCount) }}<small>good to go</small></span></span>
      </button>
    </div>

    <div class="workspace-folder-strip">
      <button type="button" class="workspace-folder" :title="config.source" aria-label="Open source folder" @click="openFolder('source')">
        <i class="mdi mdi-folder-open-outline workspace-folder-icon" aria-hidden="true" />
        <span><span class="workspace-folder-label">Source folder</span><span class="workspace-folder-path">{{ config.source }}<i class="mdi mdi-open-in-new" aria-hidden="true" /></span></span>
      </button>
      <i class="mdi mdi-arrow-right workspace-folder-direction" aria-hidden="true" />
      <button type="button" class="workspace-folder" :title="config.destination" aria-label="Open GDA folder" @click="openFolder('destination')">
        <i class="mdi mdi-folder-outline workspace-folder-icon" aria-hidden="true" />
        <span><span class="workspace-folder-label">GDA destination</span><span class="workspace-folder-path">{{ config.destination }}<i class="mdi mdi-open-in-new" aria-hidden="true" /></span></span>
      </button>
      <button type="button" class="workspace-folder-settings" aria-label="Workspace settings" title="Workspace settings" @click="navigate('settings')"><i class="mdi mdi-tune" aria-hidden="true" /></button>
    </div>
    <p class="workspace-last-scan">Last scanned {{ time(data!.scannedAt) }}</p>
  </section>
</template>

<style scoped>
.workspace-header { margin-bottom: 22px; }
.workspace-header-top { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.workspace-header-intro { min-width: 0; }
.workspace-eyebrow { margin: 0 0 9px; font-size: 9px; font-weight: 500; letter-spacing: 2px; text-transform: uppercase; color: #87958c; }
h1 { margin: 0 0 10px; font-size: clamp(26px, 2.6vw, 34px); line-height: 1.2; font-weight: 500; letter-spacing: -0.8px; overflow-wrap: anywhere; }
.workspace-title-dot { color: #85a777; }
.workspace-subtitle { margin: 0; color: #87909b; font-size: 12px; line-height: 1.5; }
.workspace-header-actions { display: flex; flex-shrink: 0; gap: 10px; flex-wrap: wrap; }
.workspace-header-actions .btn { min-height: 40px; border-radius: 7px; white-space: nowrap; }
.workspace-header-actions .btn-outline-primary { background: #fff; border-color: #dce2dc; color: #5d7063; }
.workspace-header-actions .btn-outline-primary:hover { background: #f1f5f1; }
.workspace-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.workspace-metric { display: flex; position: relative; align-items: center; gap: 14px; min-width: 0; padding: 20px 18px; border: 1px solid #e0e5de; border-radius: 9px; background: #fff; color: #29383b; text-align: left; font-family: inherit; cursor: pointer; transition: border-color 0.15s; }
.workspace-metric:hover { border-color: #aebcac; }
.workspace-metric-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 42px; height: 44px; border-radius: 10px; font-size: 24px; }
.workspace-metric-icon.total { color: #828d70; background: #f0f2eb; }
.workspace-metric-icon.pending { color: #cc8a43; background: #fdf1e5; }
.workspace-metric-icon.synced { color: #80a263; background: #edf4e6; }
.workspace-metric-copy { display: block; min-width: 0; }
.workspace-metric-label { display: block; margin-bottom: 6px; color: #8a968d; font-size: 11px; }
.workspace-metric-value { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 9px; row-gap: 2px; font-size: 28px; font-weight: 500; line-height: 1.15; letter-spacing: -0.7px; }
.workspace-metric-value small { font-size: 10px; font-weight: 400; color: #97a098; letter-spacing: 0; line-height: 1.4; }
.workspace-metric-arrow { position: absolute; right: 14px; top: 14px; color: #a5b199; font-size: 17px; }
.workspace-folder-strip { display: flex; align-items: center; gap: 16px; padding: 12px 16px; background: #f0f3ed; border: 1px solid #e0e5de; border-radius: 8px; }
.workspace-folder { display: flex; align-items: center; gap: 12px; flex: 1; min-width: 0; padding: 0; background: transparent; border: 0; color: #7e896f; text-align: left; cursor: pointer; }
.workspace-folder > span { min-width: 0; }
.workspace-folder-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 34px; height: 34px; border: 1px solid #dee5d5; border-radius: 7px; font-size: 21px; background: #e9eee1; }
.workspace-folder-label { display: block; margin-bottom: 4px; font-size: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.4px; }
.workspace-folder-path { display: block; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workspace-folder-path i { margin-left: 8px; }
.workspace-folder-direction { color: #9eae92; font-size: 22px; }
.workspace-folder-settings { padding: 6px 0 6px 15px; border: 0; border-left: 1px solid #dce3d5; background: transparent; color: #86937d; font-size: 22px; cursor: pointer; }
.workspace-last-scan { margin: 8px 0 0; color: #929aa1; font-size: 11px; text-align: right; }
@media (max-width: 1199px) { .workspace-metric { padding: 18px 12px; gap: 10px; } .workspace-metric-value { font-size: 25px; } }
@media (max-width: 767px) {
  .workspace-header-top { flex-direction: column; align-items: flex-start; gap: 16px; }
  .workspace-metrics { grid-template-columns: 1fr; gap: 10px; }
  .workspace-metric { padding: 16px; }
  .workspace-folder-strip { flex-wrap: wrap; gap: 12px; }
  .workspace-folder { flex-basis: calc(100% - 45px); }
  .workspace-folder-direction { display: none; }
  .workspace-folder-settings { margin-left: auto; }
}
</style>
