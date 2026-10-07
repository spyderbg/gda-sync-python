<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { themeColor } from '../charts/chartjs';
import { STORAGE_COLORS, copiedArea, coverageBars, formatRadar, gauge, growthArea, overview, sparkline, storageBars } from '../charts/configs';
import BaseDropdown from '../components/BaseDropdown.vue';
import ChartCanvas from '../components/ChartCanvas.vue';
import ChartLegend from '../components/ChartLegend.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { ago, number, percent, plural, size, time } from '../format';
import {
  PERIODS, folderStorage, folderSummaries, formatMix, formatShares, growth, syncHistory, timeline, trend, typeCoverage,
  type Period, type StorageMetric,
} from '../insights';
import type { AssetStatus, DashboardAsset, DashboardResponse } from '../types';
import { busy, config, data, inspect, navigate, selectWorkspace } from '../workspace';

const dashboard = ref<DashboardResponse | null>(null);
const loading = ref(true);
const loadError = ref('');
const reload = ref(0);
watch([data, reload], async (_value, _previous, onCleanup) => {
  const controller = new AbortController();
  onCleanup(() => controller.abort());
  loading.value = true;
  loadError.value = '';
  try {
    const response = await fetch('/api/dashboard', { signal: controller.signal, cache: 'no-store' });
    const body = await response.json();
    if (!response.ok) throw new Error(body.error || 'Request failed');
    if (!controller.signal.aborted) dashboard.value = body;
  } catch (error) {
    if (!controller.signal.aborted) loadError.value = (error as Error).message;
  } finally {
    if (!controller.signal.aborted) loading.value = false;
  }
}, { immediate: true });

const assets = computed(() => dashboard.value?.assets ?? []);
const pending = computed(() => assets.value.filter(asset => asset.status !== 'synced'));
const syncedCount = computed(() => assets.value.length - pending.value.length);
const totalSize = computed(() => assets.value.reduce((sum, asset) => sum + asset.size, 0));
const formats = computed(() => new Set(assets.value.map(asset => asset.extension)));
const countStatus = (status: AssetStatus) => assets.value.filter(asset => asset.status === status).length;

async function inspectAsset(asset: DashboardAsset) {
  if (busy.value) return;
  if (asset.workspaceId !== (config.value.defaultWorkspace || 'current')) await selectWorkspace(asset.workspaceId);
  if (asset.workspaceId === (config.value.defaultWorkspace || 'current')) inspect(asset);
}
const assetKey = (asset: DashboardAsset) => `${asset.workspaceId}:${asset.id}`;

const period = ref<Period>('week');
const metric = ref<StorageMetric>('size');
const activity = computed(() => dashboard.value?.activity ?? []);
const syncs = computed(() => activity.value.filter(entry => entry.action === 'sync'));
const lastSync = computed(() => syncs.value[0]);
const inSyncPercent = computed(() => percent(syncedCount.value, assets.value.length));
const sizeOf = (status: 'synced' | 'pending') => assets.value
  .filter(asset => (asset.status === 'synced') === (status === 'synced'))
  .reduce((sum, asset) => sum + asset.size, 0);
const byModified = (a: { modifiedAt: string }, b: { modifiedAt: string }) => b.modifiedAt.localeCompare(a.modifiedAt);

const stats = computed<{ value: string; label: string; detail: string; values: number[] }[]>(() => [
  {
    value: number(assets.value.length), label: 'Total assets', values: trend(assets.value, () => 1, true),
    detail: `${formats.value.size} format${plural(formats.value.size)}`,
  },
  {
    value: number(pending.value.length), label: 'Needs sync', values: trend(assets.value, asset => Number(asset.status !== 'synced'), true),
    detail: `${number(countStatus('new'))} new · ${number(countStatus('modified'))} modified`,
  },
  {
    value: number(syncedCount.value), label: 'In sync', values: trend(assets.value, asset => Number(asset.status === 'synced'), true),
    detail: `${inSyncPercent.value}% of library`,
  },
  {
    value: size(totalSize.value), label: 'Library size', values: trend(assets.value, asset => asset.size, true),
    detail: `${size(sizeOf('pending'))} to copy`,
  },
]);

const series = computed(() => timeline(assets.value, activity.value, period.value));
const changedInPeriod = computed(() => series.value.changed.reduce((sum, value) => sum + value, 0));
const syncedInPeriod = computed(() => series.value.synced.reduce((sum, value) => sum + value, 0));
const overviewChart = computed(() => overview(series.value));
const overviewLegend = computed(() => [{ label: 'Changed in GDA', color: themeColor('info') }, { label: 'Synced to Game', color: themeColor('success') }]);

const radarChart = computed(() => formatRadar(formatMix(assets.value)));
const radarLegend = [{ label: 'In sync', color: 'rgba(88, 208, 222, 0.8)' }, { label: 'Needs sync', color: 'rgba(150, 77, 247, 1)' }];

const growthChart = computed(() => growthArea(growth(assets.value)));
const copiedBytes = computed(() => syncs.value.reduce((sum, entry) => sum + (entry.bytes ?? 0), 0));
const copiedChart = computed(() => {
  const history = syncHistory(activity.value);
  // A single sync still draws an area, rising from zero.
  return history.values.length === 1 ? copiedArea({ labels: ['', ...history.labels], values: [0, ...history.values] }) : copiedArea(history);
});

const storageChart = computed(() => storageBars(folderStorage(assets.value, metric.value), metric.value));
const storageLegend = [
  { label: 'In sync', color: STORAGE_COLORS.synced }, { label: 'Modified', color: STORAGE_COLORS.modified }, { label: 'New', color: STORAGE_COLORS.new },
];

const coverageChart = computed(() => coverageBars(typeCoverage(assets.value)));
const gaugeChart = computed(() => gauge(inSyncPercent.value));
const waiting = computed(() => [...pending.value].sort(byModified).slice(0, 5));
const largest = computed(() => [...assets.value].sort((a, b) => b.size - a.size).slice(0, 4));
const recent = computed(() => [...assets.value].sort(byModified).slice(0, 4));
const formatRows = computed(() => formatShares(assets.value));
const folderRows = computed(() => folderSummaries(assets.value));
const avatarColors = ['bg-warning', 'bg-success', 'bg-info', 'bg-primary'];
</script>

<template>
  <section class="card grid-margin dashboard-guide" aria-labelledby="dashboard-guide-title">
    <div class="card-body">
      <h2 id="dashboard-guide-title">Keep game resources in sync with the GDA</h2>
      <p class="text-muted">EGT GDA Sync compares game resources with their GDA folders and helps you copy updated GDA files into each game's folder. This dashboard combines the asset libraries of all configured workspaces.</p>
      <ol class="dashboard-guide-steps">
        <li><h3>Select a workspace</h3><p>Choose a game from the sidebar to open its Sync page and review its GDA and Game folders.</p></li>
        <li><h3>Compare resources</h3><p>Click Rescan in the workspace to compare its game resources with the GDA. Follow the comparison on Sync in progress.</p></li>
        <li><h3>Review and sync</h3><p>Review different, missing, and invalid resources. Select available GDA versions to copy, confirm the changes, and check saved results in Sync history.</p></li>
      </ol>
    </div>
  </section>

  <div v-if="loading" class="card grid-margin" role="status"><div class="card-body text-muted">Loading statistics from all configured workspaces…</div></div>
  <div v-else-if="loadError" class="alert alert-danger" role="alert">
    Could not load workspace statistics: {{ loadError }}
    <button type="button" class="btn btn-outline-danger btn-sm ml-2" @click="reload++">Retry</button>
  </div>
  <template v-else-if="dashboard">
    <div v-if="dashboard.warnings.length" class="alert alert-warning" role="status">
      <p class="mb-1">Some workspace folders or files are unavailable. Totals include the files that could be scanned.</p>
      <ul class="mb-0"><li v-for="(warning, index) in dashboard.warnings" :key="index">{{ warning }}</li></ul>
    </div>


  <div class="row">
    <div class="col-md-12 grid-margin">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-1">All workspaces</h4>
          <p class="text-muted mb-4">Combined statistics for {{ number(dashboard.workspaces.length) }} configured workspace{{ plural(dashboard.workspaces.length) }}.</p>
          <div class="row dashboard-stats">
            <div v-for="(stat, i) in stats" :key="stat.label" :class="['col-lg-3 col-md-6', { 'mt-md-0 mt-4': i > 0 }]">
              <div class="d-flex">
                <div class="wrapper">
                  <h3 class="mb-0 font-weight-semibold">{{ stat.value }}</h3>
                  <h5 class="mb-0 font-weight-medium text-primary">{{ stat.label }}</h5>
                  <p class="mb-0 text-muted">{{ stat.detail }}</p>
                </div>
                <div class="wrapper my-auto ml-auto ml-lg-4">
                  <ChartCanvas :config="sparkline(stat.values)" :label="`${stat.label} over time`" :height="50" :width="100" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="col-md-8 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-0">Library Statistics Overview</h4>
          <div class="d-flex flex-column flex-lg-row">
            <p>GDA changes and files synced to the game, {{ PERIODS.find(item => item.id === period)!.description }}</p>
            <ul class="nav nav-tabs sales-mini-tabs ml-lg-auto mb-4 mb-md-0" role="tablist" aria-label="Period">
              <li v-for="item in PERIODS" :key="item.id" class="nav-item">
                <button type="button" role="tab" :aria-selected="period === item.id" :class="['nav-link', { active: period === item.id }]" @click="period = item.id">{{ item.label }}</button>
              </li>
            </ul>
          </div>
          <div class="d-flex flex-column flex-lg-row">
            <div class="data-wrapper d-flex mt-2 mt-lg-0">
              <div class="wrapper pr-5">
                <h5 class="mb-0">Changed in GDA</h5>
                <div class="d-flex align-items-center">
                  <h4 class="font-weight-semibold mb-0">{{ number(changedInPeriod) }}</h4>
                  <small class="ml-2 text-gray d-none d-lg-block"><b>{{ percent(changedInPeriod, assets.length) }}%</b> of {{ number(assets.length) }} assets</small>
                </div>
              </div>
              <div class="wrapper">
                <h5 class="mb-0">Synced to Game</h5>
                <div class="d-flex align-items-center">
                  <h4 class="font-weight-semibold mb-0">{{ number(syncedInPeriod) }}</h4>
                  <small class="ml-2 text-gray d-none d-lg-block"><b>{{ inSyncPercent }}%</b> of the library in sync</small>
                </div>
              </div>
            </div>
            <div id="sales-statistics-legend" class="ml-lg-auto"><ChartLegend :items="overviewLegend" /></div>
          </div>
          <ChartCanvas class="mt-5" :config="overviewChart" label="GDA changes and synced files over time" :height="280" />
        </div>
      </div>
    </div>
    <div class="col-md-4 grid-margin stretch-card">
      <div class="card">
        <div class="card-body d-flex flex-column">
          <div class="wrapper">
            <h4 class="card-title mb-0">Asset Mix</h4>
            <p>Files per format, in sync and waiting</p>
            <div id="net-profit-legend" class="mb-4"><ChartLegend :items="radarLegend" /></div>
          </div>
          <ChartCanvas class="my-auto" :config="radarChart" label="Files per format in sync and waiting for sync" :height="260" />
        </div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="col-md-8">
      <div class="row">
        <div class="col-md-6 grid-margin stretch-card">
          <div class="card">
            <div class="card-body pb-0">
              <div class="d-flex justify-content-between">
                <h4 class="card-title mb-0">Library Size</h4>
                <p class="font-weight-semibold mb-0">{{ number(assets.length) }} files</p>
              </div>
              <h3 class="font-weight-medium mb-4">{{ size(totalSize) }}</h3>
            </div>
            <ChartCanvas class="mt-n4" :config="growthChart" label="Library size as files were added" :height="90" />
          </div>
        </div>
        <div class="col-md-6 grid-margin stretch-card">
          <div class="card">
            <div class="card-body pb-0">
              <div class="d-flex justify-content-between">
                <h4 class="card-title mb-0">Copied to Game</h4>
                <p class="font-weight-semibold mb-0">{{ syncs.length }} sync{{ plural(syncs.length) }}</p>
              </div>
              <h3 class="font-weight-medium">{{ size(copiedBytes) }}</h3>
            </div>
            <ChartCanvas v-if="syncs.length" class="mt-n3" :config="copiedChart" label="Data copied by recent syncs" :height="90" />
            <p v-else class="chart-placeholder text-muted">No syncs yet. Data copied to the game appears here.</p>
          </div>
        </div>
        <div class="col-md-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <h4 class="card-title mb-0">Storage Overview</h4>
              <div class="d-flex align-items-center justify-content-between w-100">
                <p class="mb-0">{{ metric === 'size' ? 'Data' : 'Files' }} per top-level folder, by sync status.</p>
                <BaseDropdown menu-class="dropdown-menu-right">
                  <template #toggle="{ open, toggle }">
                    <button type="button" class="btn btn-outline-secondary dropdown-toggle" aria-haspopup="true" :aria-expanded="open" :aria-label="`Measure: ${metric === 'size' ? 'by size' : 'by files'}`" @click="toggle">{{ metric === 'size' ? 'By size' : 'By files' }}</button>
                  </template>
                  <button type="button" class="dropdown-item" @click="metric = 'size'">By size</button>
                  <button type="button" class="dropdown-item" @click="metric = 'files'">By files</button>
                </BaseDropdown>
              </div>
              <div class="d-flex align-items-end">
                <h3 class="mb-0 font-weight-semibold">{{ metric === 'size' ? (totalSize / 1048576).toFixed(1) : number(assets.length) }}</h3>
                <p class="mb-0 font-weight-medium mr-2 ml-2 mb-1">{{ metric === 'size' ? 'MB' : 'files' }}</p>
                <p class="mb-0 text-success font-weight-semibold mb-1">({{ inSyncPercent }}% in sync)</p>
              </div>
              <ChartLegend class="mt-3" :items="storageLegend" />
              <ChartCanvas class="mt-3" :config="storageChart" label="Storage per folder by sync status" :height="230" />
            </div>
          </div>
        </div>
        <div class="col-md-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <div class="d-flex justify-content-between">
                <h4 class="card-title mb-0">Waiting for Sync</h4>
              </div>
              <p>The most recently changed assets that are not in the game yet.</p>
              <div class="table-responsive">
                <table class="table table-striped table-hover">
                  <thead><tr><th>Asset</th><th>Folder</th><th>Status</th><th>Modified</th><th class="text-right">Size</th></tr></thead>
                  <tbody>
                    <tr v-for="asset in waiting" :key="assetKey(asset)" class="clickable-row" @click="inspectAsset(asset)">
                      <td class="font-weight-medium">{{ asset.name }}</td>
                      <td>{{ asset.workspaceName }} / {{ asset.folder }}</td>
                      <td><StatusBadge :status="asset.status" /></td>
                      <td>{{ time(asset.modifiedAt) }}</td>
                      <td class="text-right">{{ size(asset.size) }}</td>
                    </tr>
                    <tr v-if="!waiting.length"><td colspan="5" class="text-center text-muted">No available assets are waiting for sync across the configured workspaces.</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6 grid-margin stretch-card">
          <div class="card">
            <div class="card-body">
              <div class="row">
                <div class="col-md-6">
                  <div class="d-flex align-items-center pb-2"><div class="dot-indicator bg-success mr-2" /><p class="mb-0">In sync</p></div>
                  <h4 class="font-weight-semibold">{{ size(sizeOf('synced')) }}</h4>
                  <div class="progress progress-md">
                    <div class="progress-bar bg-success" role="progressbar" aria-label="Data in sync" :style="{ width: `${percent(sizeOf('synced'), totalSize)}%` }" :aria-valuenow="percent(sizeOf('synced'), totalSize)" aria-valuemin="0" aria-valuemax="100" />
                  </div>
                </div>
                <div class="col-md-6 mt-4 mt-md-0">
                  <div class="d-flex align-items-center pb-2"><div class="dot-indicator bg-danger mr-2" /><p class="mb-0">Needs sync</p></div>
                  <h4 class="font-weight-semibold">{{ size(sizeOf('pending')) }}</h4>
                  <div class="progress progress-md">
                    <div class="progress-bar bg-danger" role="progressbar" aria-label="Data waiting for sync" :style="{ width: `${percent(sizeOf('pending'), totalSize)}%` }" :aria-valuenow="percent(sizeOf('pending'), totalSize)" aria-valuemin="0" aria-valuemax="100" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-6 grid-margin stretch-card average-price-card">
          <div class="card text-white">
            <div class="card-body">
              <div class="d-flex justify-content-between pb-2 align-items-center">
                <h2 class="font-weight-semibold mb-0">{{ size(assets.length ? Math.round(totalSize / assets.length) : 0) }}</h2>
                <div class="icon-holder"><i aria-hidden="true" class="mdi mdi-file-outline" /></div>
              </div>
              <div class="d-flex justify-content-between">
                <h5 class="font-weight-semibold mb-0">Average Asset Size</h5>
                <p class="text-white mb-0">Across {{ number(assets.length) }} assets</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-4">
      <div class="row">
        <div class="col-md-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <h4 class="card-title mb-4">Combined Workspace Metrics</h4>
              <div class="row">
                <div class="col-5 col-md-5">
                  <div class="wrapper border-bottom mb-2 pb-2">
                    <h4 class="font-weight-semibold mb-0">{{ number(assets.length) }}</h4>
                    <div class="d-flex align-items-center"><p class="mb-0">GDA files</p><div class="dot-indicator bg-secondary ml-auto" /></div>
                  </div>
                  <div class="wrapper">
                    <h4 class="font-weight-semibold mb-0">{{ number(syncedCount) }}</h4>
                    <div class="d-flex align-items-center"><p class="mb-0">In Game</p><div class="dot-indicator bg-primary ml-auto" /></div>
                  </div>
                </div>
                <div class="col-7 col-md-7 d-flex pl-4">
                  <ChartCanvas class="ml-auto w-100" :config="coverageChart" label="Files in sync per asset type" :height="100" />
                </div>
              </div>
              <div class="row mt-5">
                <div class="col-6">
                  <div class="d-flex align-items-center mb-2">
                    <div class="icon-holder bg-primary text-white py-1 px-3 rounded mr-2"><i aria-hidden="true" class="mdi mdi-sync icon-sm" /></div>
                    <h2 class="font-weight-semibold mb-0">{{ lastSync ? number(lastSync.files.length) : 0 }}</h2>
                  </div>
                  <p>{{ lastSync ? 'Files in the last sync' : 'No syncs yet' }}</p>
                  <p><span class="font-weight-medium">{{ lastSync ? ago(lastSync.date) : 'Sync to start' }}</span></p>
                </div>
                <div class="col-6">
                  <div class="gauge">
                    <ChartCanvas :config="gaugeChart" :label="`${inSyncPercent}% of files in sync`" :height="90" />
                    <div class="gauge-value"><span class="font-weight-semibold">{{ inSyncPercent }}%</span><small>in sync</small></div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <h4 class="card-title mb-4">File Formats</h4>
              <div v-for="(row, i) in formatRows" :key="row.format" :class="['wrapper', { 'mt-3': i > 0 }]">
                <div class="d-flex w-100 pb-2">
                  <p class="mb-0 font-weight-semibold">{{ row.format }}</p>
                  <div class="wrapper ml-auto d-flex align-items-center">
                    <p class="font-weight-semibold mb-0">{{ number(row.files) }}</p>
                    <p class="ml-1 mb-0">{{ row.share }}%</p>
                  </div>
                </div>
                <div class="progress progress-sm">
                  <div :class="['progress-bar', ['bg-primary', 'bg-info', 'bg-success', 'bg-warning'][i % 4]]" role="progressbar" :aria-label="`${row.format} share`" :style="{ width: `${row.share}%` }" :aria-valuenow="row.share" aria-valuemin="0" aria-valuemax="100" />
                </div>
              </div>
            </div>
          </div>
        </div>
        <div class="col-md-12 grid-margin">
          <div class="card">
            <div class="card-body">
              <h4 class="card-title mb-0">Largest Assets</h4>
              <div v-for="(asset, i) in largest" :key="assetKey(asset)" :class="['d-flex py-2', { 'mt-3': i === 0, 'border-bottom': i < largest.length - 1 }]">
                <span :class="['img-sm rounded-circle text-white text-avatar', avatarColors[i % avatarColors.length]]">{{ asset.extension.slice(0, 3).toUpperCase() }}</span>
                <div class="wrapper ml-2 min-w-0">
                  <a href="#" class="d-block mb-n1 font-weight-semibold text-dark text-truncate" @click.prevent="inspectAsset(asset)">{{ asset.name }}</a>
                  <small>{{ asset.workspaceName }} · {{ size(asset.size) }}</small>
                </div>
                <small class="text-muted ml-auto text-nowrap pl-2">{{ ago(asset.modifiedAt) }}</small>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>

  <div class="row">
    <div class="col-md-4 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-0">Recent Changes</h4>
          <div v-for="(asset, i) in recent" :key="assetKey(asset)" :class="['d-flex py-2', { 'border-bottom': i < recent.length - 1 }]">
            <div class="wrapper min-w-0">
              <small class="text-muted">{{ time(asset.modifiedAt) }}</small>
              <p class="font-weight-semibold text-gray mb-0 text-truncate">{{ asset.name }}</p>
              <small class="text-muted">{{ asset.workspaceName }}</small>
            </div>
            <a href="#" class="ml-auto pl-2" @click.prevent="inspectAsset(asset)"><small class="text-muted">Inspect</small></a>
          </div>
        </div>
      </div>
    </div>
    <div class="col-md-4 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between pb-3">
            <h4 class="card-title mb-0">Activities</h4>
            <p class="mb-0 text-muted">{{ syncs.length }} synced, {{ pending.length }} remaining</p>
          </div>
          <ul v-if="activity.length" class="timeline">
            <li v-for="entry in activity.slice(0, 5)" :key="entry.id" class="timeline-item">
              <p class="timeline-content"><a href="#" @click.prevent="navigate('history')">{{ entry.message }}</a></p>
              <p class="event-time">{{ ago(entry.date) }}</p>
            </li>
          </ul>
          <p v-else class="text-muted">No activity yet. Syncs and rescans appear here.</p>
          <a class="d-block mt-3" href="#" @click.prevent="navigate('history')">Show all</a>
        </div>
      </div>
    </div>
    <div class="col-md-4 grid-margin stretch-card">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-0">Folders</h4>
          <div class="table-responsive">
            <table class="table table-stretched">
              <thead><tr><th>Folder</th><th>Size</th><th>Status</th></tr></thead>
              <tbody>
                <tr v-for="row in folderRows" :key="row.name">
                  <td><p class="mb-1 text-dark font-weight-medium">{{ row.name }}</p><small class="font-weight-medium">{{ row.files }} file{{ plural(row.files) }}</small></td>
                  <td class="font-weight-medium">{{ size(row.size) }}</td>
                  <td :class="['font-weight-medium', row.pending ? 'text-danger' : 'text-success']">{{ row.pending ? `${row.pending} to sync` : 'In sync' }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  </div>
  </template>
</template>


<style scoped>
.dashboard-guide h2 { margin: 0 0 12px; font-size: 22px; font-weight: 500; }
.dashboard-guide > .card-body > p { max-width: 900px; margin-bottom: 22px; line-height: 1.6; }
.dashboard-guide-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; margin: 0; padding-left: 22px; }
.dashboard-guide-steps li { padding-left: 4px; color: #2277cf; }
.dashboard-guide-steps h3 { margin: 0 0 6px; font-size: 15px; font-weight: 500; color: #343a40; }
.dashboard-guide-steps p { margin: 0; font-size: 13px; line-height: 1.6; color: #6c757d; }
.dashboard-stats > div { min-width: 0; }
.dashboard-stats > div > .d-flex { flex-wrap: wrap; gap: 12px; }
@media (max-width: 767px) { .dashboard-guide-steps { grid-template-columns: 1fr; gap: 16px; } }
</style>
