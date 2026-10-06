<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { themeColor } from '../charts/chartjs';
import { syncRunBars } from '../charts/configs';
import ChartCanvas from '../components/ChartCanvas.vue';
import ChartLegend from '../components/ChartLegend.vue';
import PageHeader from '../components/PageHeader.vue';
import ReportNotice from '../components/ReportNotice.vue';
import { ago, number, plural, size, time } from '../format';
import type { RssSyncHistory, RssSyncHistoryEntry, RssSyncSummary, RssSyncWorkspace } from '../types';
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
const workspace = ref<RssSyncWorkspace | null>(null);
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
    workspace.value = (body as RssSyncHistory).workspace;
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

const SETTINGS: (keyof RssSyncWorkspace)[] = ['game_path', 'gda_path', 'common_gda_path', 'extensions', 'resource_paths', 'ignore_dds_mips'];
/** Whether the settings a run used differ from the workspace's settings now. */
function settingsChanged(run: RssSyncHistoryEntry) {
  const now = workspace.value;
  return !!run.workspace && !!now && SETTINGS.some(key => JSON.stringify(run.workspace![key]) !== JSON.stringify(now[key]));
}

/** The share of the compared resources in each result, as the widths of the card's bar. */
const shares = (summary: RssSyncSummary) => COLUMNS.map(column => ({ ...column, width: summary.compared ? summary[column.key] / summary.compared * 100 : 0 }));
const barColors: Record<string, string> = { identical: 'bg-success', missing: 'bg-warning', different: 'bg-danger', invalid: 'bg-dark' };

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

  <div v-if="workspace" class="row">
    <div :class="[succeeded.length ? 'col-lg-7' : 'col-12', 'grid-margin', 'stretch-card']">
      <div class="card">
        <div class="card-body">
          <div class="d-flex justify-content-between align-items-baseline">
            <h4 class="card-title mb-0">Workspace</h4>
            <p class="mb-0 text-muted history-id">{{ workspace.id }}</p>
          </div>
          <p class="history-workspace-name">{{ workspace.game_name }}</p>
          <dl class="history-info">
            <dt>Game folder</dt><dd class="history-path">{{ workspace.game_path }}</dd>
            <dt>GDA folder</dt><dd class="history-path">{{ workspace.gda_path }}</dd>
            <dt v-if="workspace.common_gda_path">Common GDA folder</dt><dd v-if="workspace.common_gda_path" class="history-path">{{ workspace.common_gda_path }}</dd>
            <dt>Extensions</dt>
            <dd><span v-for="extension in workspace.extensions" :key="extension" class="history-extension">{{ extension }}</span></dd>
            <template v-if="workspace.resource_paths.length">
              <dt>Resource paths</dt><dd class="history-path"><span v-for="path in workspace.resource_paths" :key="path" class="d-block">{{ path }}</span></dd>
            </template>
            <dt>DDS mip levels</dt><dd>{{ workspace.ignore_dds_mips ? 'Ignored when comparing' : 'Compared' }}</dd>
            <dt>Last run</dt><dd>{{ runs.length ? `${time(runs[0].finishedAt)} (${ago(runs[0].finishedAt)})` : 'Never' }}</dd>
          </dl>
        </div>
      </div>
    </div>
    <div v-if="succeeded.length" class="col-lg-5 grid-margin">
      <div class="card">
        <div class="card-body">
          <h4 class="card-title mb-2">Results by run</h4>
          <div class="history-legend"><ChartLegend :items="legend" /></div>
          <ChartCanvas class="mt-3" :config="chart" :label="`Results of the last ${Math.min(CHART_RUNS, succeeded.length)} successful GDA sync runs`" :height="220" />
        </div>
      </div>
    </div>
  </div>

  <div v-if="runs.length || running" class="d-flex flex-wrap justify-content-between align-items-baseline">
    <h4 class="history-heading mr-3">GDA sync runs</h4>
    <p class="mb-3 text-muted">Newest first · changes are counted from the previous successful run</p>
  </div>
  <div v-if="runs.length || running" class="history-runs" aria-label="GDA sync runs">
    <div v-if="running" class="card history-run">
      <div class="card-body history-row">
        <div class="history-when">
          <span class="badge badge-primary"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" /> Running</span>
          <h5 class="history-run-time">Started {{ time(rssSync!.startedAt!) }}</h5>
        </div>
        <p class="history-pending text-muted">Results appear here when the run ends.</p>
      </div>
    </div>
    <article v-for="{ run, previous } in rows" :key="run.file" :class="['card', 'history-run', run.summary ? 'history-run-ok' : 'history-run-failed']">
      <div class="card-body">
        <div class="history-row">
          <div class="history-when">
            <span :class="['badge', run.summary ? 'badge-success' : 'badge-danger']">{{ run.summary ? 'Succeeded' : 'Failed' }}</span>
            <h5 class="history-run-time">{{ time(run.finishedAt) }}</h5>
            <small class="text-muted d-block">{{ ago(run.finishedAt) }} · took {{ duration(run) }}</small>
          </div>

          <template v-if="run.summary">
            <div class="history-result">
              <p class="history-compared">{{ number(run.summary.compared) }}<small>resource{{ plural(run.summary.compared) }} compared</small></p>
              <div class="progress history-bar" role="img" :aria-label="COLUMNS.map(column => `${number(run.summary![column.key])} ${column.label.toLowerCase()}`).join(', ')">
                <div v-for="share in shares(run.summary)" :key="share.key" :class="['progress-bar', barColors[share.key]]" :style="{ width: `${share.width}%` }" />
              </div>
              <p v-if="run.summary.identicalMipOnly" class="history-note">{{ number(run.summary.identicalMipOnly) }} in sync except for DDS mip levels</p>
            </div>
            <div class="history-stats">
              <div v-for="column in COLUMNS" :key="column.key" class="history-stat">
                <span class="history-stat-label"><i aria-hidden="true" :class="['mdi', 'mdi-circle', barColors[column.key].replace('bg-', 'text-')]" />{{ column.label }}</span>
                <span class="history-stat-value">{{ number(run.summary[column.key]) }}</span>
                <small v-if="previous && run.summary[column.key] !== previous[column.key]"
                       :class="changeClass(run.summary[column.key] - previous[column.key], column.riseIsBetter)">{{ signed(run.summary[column.key] - previous[column.key]) }}</small>
              </div>
            </div>
          </template>
          <p v-else class="history-error">{{ run.error }}</p>
        </div>

        <div class="history-run-footer">
          <small class="text-muted history-file" :title="run.file">{{ run.file }}</small>
          <small v-if="run.descriptors !== undefined" class="text-muted">{{ number(run.descriptors) }} descriptor{{ plural(run.descriptors) }} parsed</small>
          <small v-if="settingsChanged(run)" class="text-warning"><i aria-hidden="true" class="mdi mdi-alert-outline" /> Workspace settings have changed since this run</small>
        </div>
      </div>
    </article>
  </div>

  <ReportNotice v-if="loaded && !runs.length && !running" />

  <div v-if="copies.length" class="card grid-margin">
    <div class="card-body">
      <h4 class="card-title mb-0">Copies to the Game folder</h4>
      <p class="text-muted history-intro">Files copied with Sync selected or Sync all pending, in every workspace. Replaced Game files are backed up in <code>{{ data!.backupPath }}</code>.</p>
      <div class="table-responsive">
        <table class="table table-striped activity-table" aria-label="Copies to the Game folder">
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

</template>

<style scoped>
.history-intro { margin: 6px 0 16px; font-size: 13px; }
.history-alert { display: flex; align-items: flex-start; gap: 10px; }
.history-alert span { overflow-wrap: anywhere; }
.history-id { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; }
.history-workspace-name { margin: 6px 0 14px; font-size: 18px; font-weight: 500; }
.history-info { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 8px 18px; margin: 0; font-size: 13px; }
.history-info dt { color: #87909b; font-weight: 400; }
.history-info dd { margin: 0; overflow-wrap: anywhere; }
.history-extension { display: inline-block; margin: 0 4px 4px 0; padding: 2px 8px; border: 1px solid #dce2dc; border-radius: 4px; font-family: monospace; font-size: 12px; }
.history-path { font-family: monospace; font-size: 12px; }
.history-heading { margin: 4px 0 14px; font-size: 16px; }
.history-run { border-left: 3px solid transparent; }
.history-run-ok { border-left-color: #57b657; }
.history-run-failed { border-left-color: #d2453c; }
.history-runs { margin-bottom: 1.5rem; }
.history-runs > .card { margin-bottom: 14px; }
.history-row { display: flex; align-items: center; gap: 12px 28px; flex-wrap: wrap; }
.history-when { flex: 0 0 190px; }
.history-result { flex: 1 1 220px; min-width: 0; }
.history-run-time { margin: 10px 0 2px; font-size: 16px; font-weight: 500; }
.history-pending { margin: 0; font-size: 13px; }
.history-compared { margin: 0 0 8px; font-size: 22px; font-weight: 500; line-height: 1.1; letter-spacing: -0.4px; }
.history-compared small { margin-left: 8px; font-size: 12px; font-weight: 400; color: #87909b; letter-spacing: 0; }
.history-bar { height: 8px; border-radius: 4px; }
.history-stats { display: grid; grid-template-columns: repeat(4, minmax(92px, 1fr)); gap: 10px; flex: 1 1 420px; }
.history-stat { padding: 8px 10px; border: 1px solid #ebedf2; border-radius: 6px; line-height: 1.3; }
.history-stat-label { display: block; font-size: 11px; color: #87909b; }
.history-stat-label i { margin-right: 5px; font-size: 8px; vertical-align: middle; }
.history-stat-value { font-size: 18px; font-weight: 500; }
.history-stat small { margin-left: 6px; font-size: 11px; }
.history-note { margin: 8px 0 0; font-size: 12px; color: #87909b; }
.history-error { flex: 1 1 300px; margin: 0; color: #d2453c; font-size: 13px; overflow-wrap: anywhere; }
.history-run-footer { display: flex; flex-wrap: wrap; gap: 4px 20px; margin-top: 14px; padding-top: 10px; border-top: 1px solid #ebedf2; }
.history-run-footer small { font-size: 11px; line-height: 1.5; }
.history-file { font-family: monospace; overflow-wrap: anywhere; }
/* Four series do not fit on one line in the narrow column. */
.history-legend :deep(ul) { flex-wrap: wrap; row-gap: 6px; }
@media (max-width: 575px) { .history-when { flex-basis: 100%; } .history-stats { grid-template-columns: repeat(2, minmax(0, 1fr)); } .history-info { grid-template-columns: minmax(0, 1fr); gap: 2px; } .history-info dd { margin-bottom: 8px; } }
</style>
