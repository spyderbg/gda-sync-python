<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { themeColor } from '../charts/chartjs';
import { syncRunBars } from '../charts/configs';
import ChartCanvas from '../components/ChartCanvas.vue';
import ChartLegend from '../components/ChartLegend.vue';
import PageHeader from '../components/PageHeader.vue';
import { number, plural, size, time } from '../format';
import type { RssSyncHistory, RssSyncHistoryEntry, RssSyncSummary } from '../types';
import { busy, data, navigate, rescan, rssSync } from '../workspace';

const CHART_RUNS = 20;
// Whether a rise of each count is an improvement decides the color of its change.
const COLUMNS: { key: keyof RssSyncSummary; label: string; riseIsBetter: boolean }[] = [
  { key: 'identical', label: 'In sync', riseIsBetter: true },
  { key: 'missing', label: 'Missing', riseIsBetter: false },
  { key: 'different', label: 'Different', riseIsBetter: false },
  { key: 'invalid', label: 'Invalid', riseIsBetter: false },
];

const runs = ref<RssSyncHistoryEntry[]>([]);
const loaded = ref(false);
const loadError = ref('');

// Load the workspace's runs, and again whenever a run ends or the workspace changes.
let request = 0;
async function loadHistory() {
  const id = ++request;
  loadError.value = '';
  try {
    const response = await fetch('/api/rss-sync/history', { cache: 'no-store' });
    const body = await response.json();
    if (id !== request) return;
    if (!response.ok) throw new Error(body.error || 'Request failed');
    runs.value = (body as RssSyncHistory).history;
  } catch (e) {
    if (id === request) loadError.value = (e as Error).message;
  } finally {
    if (id === request) loaded.value = true;
  }
}
watch(() => `${rssSync.value?.workspaceId}|${rssSync.value?.lastRun?.finishedAt ?? ''}`, loadHistory, { immediate: true });

const running = computed(() => !!rssSync.value?.running);
const succeeded = computed(() => runs.value.filter(run => run.summary));
const failed = computed(() => runs.value.length - succeeded.value.length);
const copies = computed(() => data.value!.activity.filter(entry => entry.action === 'sync'));

/** Each run with the counts of the successful run before it, to show what changed. */
const rows = computed(() => {
  let previous: RssSyncSummary | undefined;
  return [...runs.value].reverse().map(run => {
    const row = { run, previous };
    if (run.summary) previous = run.summary;
    return row;
  }).reverse();
});
const signed = (delta: number) => (delta > 0 ? `+${number(delta)}` : `−${number(-delta)}`);
const changeClass = (delta: number, riseIsBetter: boolean) => ((delta > 0) === riseIsBetter ? 'text-success' : 'text-danger');

function duration(run: RssSyncHistoryEntry) {
  const seconds = (Date.parse(run.finishedAt) - Date.parse(run.startedAt)) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
}

const chart = computed(() => syncRunBars(succeeded.value.slice(0, CHART_RUNS).reverse().map(run => ({ label: time(run.finishedAt), summary: run.summary! }))));
const legend = computed(() => [
  { label: 'In sync', color: themeColor('success') }, { label: 'Missing', color: themeColor('warning') },
  { label: 'Different', color: themeColor('danger') }, { label: 'Invalid', color: themeColor('dark') },
]);
</script>

<template>
  <PageHeader title="Sync history">
    <template #links>
      <li><span>{{ number(runs.length) }} GDA sync run{{ plural(runs.length) }}</span></li>
      <li v-if="failed"><span>{{ number(failed) }} failed</span></li>
      <li v-if="copies.length"><span>{{ number(copies.length) }} file cop{{ copies.length === 1 ? 'y' : 'ies' }}</span></li>
    </template>
    <template #links-right>
      <li v-if="succeeded.length"><a href="#" @click.prevent="navigate('rssSync')">Latest result</a></li>
    </template>
    <template #toolbar>
      <button type="button" class="btn btn-primary toolbar-item" :disabled="!!busy || running" @click="rescan">
        <i aria-hidden="true" :class="['mdi', running ? 'mdi-loading mdi-spin' : 'mdi-refresh']" />{{ running ? 'Comparing…' : 'Rescan' }}
      </button>
    </template>
  </PageHeader>

  <div v-if="loadError" class="alert alert-danger history-alert"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" /><span>{{ loadError }}</span></div>

  <div v-if="runs.length || running" class="row">
    <div :class="[succeeded.length ? 'col-lg-8' : 'col-12', 'grid-margin', 'stretch-card']">
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-baseline">
            <h4 class="card-title mb-0">GDA sync runs</h4>
            <p class="mb-0 text-muted">Newest first</p>
          </div>
          <p class="text-muted history-intro">Every Rescan compares the game resources with the GDA folder. Changes are counted from the previous successful run.</p>
          <div class="table-responsive">
            <table class="table history-table" aria-label="GDA sync runs">
              <thead>
                <tr><th scope="col">Finished</th><th scope="col">Result</th><th v-for="column in COLUMNS" :key="column.key" scope="col" class="text-right">{{ column.label }}</th></tr>
              </thead>
              <tbody>
                <tr v-if="running">
                  <td>Started {{ time(rssSync!.startedAt!) }}</td>
                  <td><span class="badge badge-primary"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Running</span></td>
                  <td :colspan="COLUMNS.length" class="text-muted">Results appear here when the run ends.</td>
                </tr>
                <tr v-for="{ run, previous } in rows" :key="run.startedAt">
                  <td>
                    <span class="d-block">{{ time(run.finishedAt) }}</span>
                    <small class="text-muted">Took {{ duration(run) }}</small>
                  </td>
                  <td>
                    <span v-if="run.summary" class="badge badge-success">Succeeded</span>
                    <span v-else class="badge badge-danger">Failed</span>
                  </td>
                  <template v-if="run.summary">
                    <td v-for="column in COLUMNS" :key="column.key" class="text-right">
                      {{ number(run.summary[column.key]) }}
                      <small v-if="previous && run.summary[column.key] !== previous[column.key]"
                             :class="['d-block', changeClass(run.summary[column.key] - previous[column.key], column.riseIsBetter)]">
                        {{ signed(run.summary[column.key] - previous[column.key]) }}
                      </small>
                    </td>
                  </template>
                  <td v-else :colspan="COLUMNS.length" class="history-error">{{ run.error }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
    <div v-if="succeeded.length" class="col-lg-4 grid-margin">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-2">Results by run</h4>
          <div class="history-legend"><ChartLegend :items="legend" /></div>
          <ChartCanvas class="mt-3" :config="chart" :label="`Results of the last ${Math.min(CHART_RUNS, succeeded.length)} successful GDA sync runs`" :height="220" />
        </div>
      </div>
    </div>
  </div>

  <div v-if="copies.length" class="card grid-margin">
    <div class="card-body">
      <h4 class="card-title mb-0">Copies to the GDA folder</h4>
      <p class="text-muted history-intro">Files copied with Sync selected or Sync all pending, in every workspace. Replaced GDA files are backed up in <code>{{ data!.backupPath }}</code>.</p>
      <div class="table-responsive">
        <table class="table table-striped activity-table" aria-label="Copies to the GDA folder">
          <thead><tr><th scope="col">Operation</th><th scope="col">Date</th><th scope="col" class="text-right">Copied</th></tr></thead>
          <tbody>
            <tr v-for="entry in copies" :key="entry.id">
              <td>
                <div class="d-flex align-items-start">
                  <span class="activity-icon bg-success"><i aria-hidden="true" class="mdi mdi-sync" /></span>
                  <div class="min-w-0">
                    <p class="mb-1 font-weight-medium text-dark">{{ entry.message }}</p>
                    <details v-if="entry.files.length">
                      <summary>View {{ entry.files.length }} files</summary>
                      <span v-for="file in entry.files" :key="file" class="activity-file"><i aria-hidden="true" class="mdi mdi-file-outline" />{{ file }}</span>
                    </details>
                  </div>
                </div>
              </td>
              <td class="text-nowrap">{{ time(entry.date) }}</td>
              <td class="text-right text-nowrap">{{ entry.bytes !== undefined ? size(entry.bytes) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>

  <div v-if="loaded && !runs.length && !running && !copies.length" class="card empty-state grid-margin">
    <div class="card-body">
      <i aria-hidden="true" class="mdi mdi-history text-muted" />
      <h4>No sync yet</h4>
      <p class="text-muted">Click Rescan to run the first GDA sync of this workspace.</p>
    </div>
  </div>
</template>

<style scoped>
.history-intro { margin: 6px 0 16px; font-size: 13px; }
.history-alert { display: flex; align-items: flex-start; gap: 10px; }
.history-alert span { overflow-wrap: anywhere; }
.history-table td { vertical-align: top; line-height: 1.4; height: auto; }
.history-table td small { font-size: 11px; }
.history-error { white-space: normal; color: #d2453c; overflow-wrap: anywhere; }
/* Four series do not fit on one line in the narrow column. */
.history-legend :deep(ul) { flex-wrap: wrap; row-gap: 6px; }
</style>
