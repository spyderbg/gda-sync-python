<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { number, plural, time } from '../format';
import type { RssCategory, RssResource, RssSyncReport } from '../types';
import { busy, rescan, rssSync } from '../workspace';

const PAGE_SIZE = 200;
const CATEGORIES: { key: RssCategory; label: string; badge: string; hint: string; detail: string }[] = [
  { key: 'identical', label: 'In sync', badge: 'badge-success', hint: 'identical copy in the GDA', detail: 'Matching GDA file' },
  { key: 'missing', label: 'Missing', badge: 'badge-warning', hint: 'no GDA file with this name', detail: 'Declared in' },
  { key: 'different', label: 'Different', badge: 'badge-danger', hint: 'same name, other content', detail: 'GDA files with this name, closest folder first' },
  { key: 'invalid', label: 'Invalid', badge: 'badge-dark', hint: 'declared path not usable', detail: 'Reason' },
];
const PHASES = { descriptors: 'Reading the *Data.json descriptors', index: 'Indexing the GDA folder', compare: 'Comparing files' };

const report = ref<RssSyncReport | null>(null);
const loading = ref(false);
const loadError = ref('');
const category = ref<RssCategory>('identical');
const query = ref('');
const shown = ref(PAGE_SIZE);

const running = computed(() => !!rssSync.value?.running);
const progress = computed(() => rssSync.value?.progress);
const summary = computed(() => report.value?.summary);
const lastRun = computed(() => report.value?.lastRun);
const current = computed(() => CATEGORIES.find(item => item.key === category.value)!);

// Load the stored report, and again whenever a run ends or the workspace changes.
let request = 0;
async function loadReport() {
  const id = ++request;
  loading.value = true;
  loadError.value = '';
  try {
    const response = await fetch('/api/rss-sync/report', { cache: 'no-store' });
    const body = await response.json();
    if (id !== request) return;
    if (response.status === 404) report.value = null;
    else if (!response.ok) throw new Error(body.error || 'Request failed');
    else report.value = body;
  } catch (e) {
    if (id === request) loadError.value = (e as Error).message;
  } finally {
    if (id === request) loading.value = false;
  }
}
watch(() => `${rssSync.value?.workspaceId}|${rssSync.value?.lastRun?.finishedAt ?? ''}`, loadReport, { immediate: true });

const rows = computed<RssResource[]>(() => {
  const all = category.value === 'identical'
    ? report.value?.identical ?? []
    : (report.value?.differences ?? []).filter(row => row.category === category.value);
  const needle = query.value.trim().toLowerCase();
  if (!needle) return all;
  return all.filter(row => row.resource.toLowerCase().includes(needle) || row.gdaFiles.some(file => file.path.toLowerCase().includes(needle)));
});
const visible = computed(() => rows.value.slice(0, shown.value));
watch([category, query, report], () => { shown.value = PAGE_SIZE; });

const duration = computed(() => {
  const { startedAt, finishedAt } = report.value ?? {};
  if (!startedAt || !finishedAt) return '';
  const seconds = (Date.parse(finishedAt) - Date.parse(startedAt)) / 1000;
  return seconds < 60 ? `${seconds.toFixed(1)} s` : `${Math.floor(seconds / 60)} min ${Math.round(seconds % 60)} s`;
});
const reason = (row: RssResource) => row.status.replace(/^invalid: /, '');
// Long paths wrap after a folder separator rather than inside a name.
const segments = (path: string) => path.split(/(?<=\/)/);
</script>

<template>
  <PageHeader title="In sync">
    <template #links>
      <li v-if="report?.finishedAt"><span>Compared {{ time(report.finishedAt) }}</span></li>
      <li v-if="duration"><span>Took {{ duration }}</span></li>
      <li v-if="report?.game"><span>Game {{ report.game }}</span></li>
    </template>
    <template #toolbar>
      <button type="button" class="btn btn-primary toolbar-item" :disabled="!!busy || running" @click="rescan">
        <i aria-hidden="true" :class="['mdi', running ? 'mdi-loading mdi-spin' : 'mdi-refresh']" />{{ running ? 'Comparing…' : 'Rescan' }}
      </button>
      <span class="toolbar-item rss-hint">Rescan compares the game resources with the GDA folder in the background.</span>
    </template>
  </PageHeader>

  <div v-if="running" class="card grid-margin rss-progress" aria-live="polite">
    <div class="card-body">
      <p class="rss-progress-title"><i aria-hidden="true" class="mdi mdi-loading mdi-spin" />GDA sync in progress</p>
      <p class="rss-progress-step">
        {{ progress ? PHASES[progress.phase] : 'Starting the background process' }}<span v-if="progress?.total"> · {{ number(progress.done) }} of {{ number(progress.total) }}</span>
      </p>
      <div class="progress">
        <div class="progress-bar progress-bar-striped progress-bar-animated" role="progressbar" aria-label="GDA sync progress"
             :style="{ width: `${progress?.total ? Math.round(progress.done / progress.total * 100) : 100}%` }" />
      </div>
    </div>
  </div>

  <div v-if="lastRun?.state === 'failed' && !running" class="alert alert-danger rss-alert">
    <i aria-hidden="true" class="mdi mdi-alert-circle-outline" />
    <span>The last GDA sync failed: {{ lastRun.error }}<template v-if="summary"> Showing the result from {{ time(report!.finishedAt!) }}.</template></span>
  </div>
  <div v-if="loadError" class="alert alert-danger rss-alert"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" /><span>{{ loadError }}</span></div>

  <div v-if="!summary && !running && !loading && !loadError" class="card empty-state">
    <div class="card-body">
      <i aria-hidden="true" class="mdi mdi-compare-horizontal text-primary" />
      <h3>No GDA sync yet</h3>
      <p class="text-muted">Click Rescan to compare this workspace's resources with its GDA folder.</p>
    </div>
  </div>

  <template v-if="summary">
    <div class="card grid-margin">
      <div class="card-body">
        <p class="rss-compared">{{ number(summary.compared) }} resource{{ plural(summary.compared) }} compared</p>
        <div class="rss-tiles" role="group" aria-label="Result categories">
          <button v-for="item in CATEGORIES" :key="item.key" type="button" :class="['rss-tile', item.key, { active: category === item.key }]" :aria-pressed="category === item.key" @click="category = item.key">
            <span class="rss-tile-label">{{ item.label }}</span>
            <span class="rss-tile-value">{{ number(summary[item.key]) }}</span>
            <span class="rss-tile-hint">{{ item.key === 'identical' && summary.identicalMipOnly ? `${number(summary.identicalMipOnly)} differ only in DDS mip levels` : item.hint }}</span>
          </button>
        </div>
        <dl class="rss-meta">
          <dt>Game folder</dt><dd>{{ report!.gameDir }}</dd>
          <dt>GDA folder</dt><dd>{{ report!.gdaDir }}</dd>
          <template v-if="report!.commonGdaDir"><dt>Common GDA</dt><dd>{{ report!.commonGdaDir }}</dd></template>
          <dt>Extensions</dt><dd>{{ report!.extensions?.join(', ') }}</dd>
          <dt>DDS mip levels</dt><dd>{{ report!.ignoreDdsMips ? 'Ignored: a copy that differs only in mip levels counts as in sync' : 'Compared byte for byte' }}</dd>
        </dl>
      </div>
    </div>

    <div class="card">
      <div class="card-body">
        <div class="rss-results-heading">
          <h4 class="card-title mb-0">{{ current.label }} <span :key="current.key" :class="['badge', 'badge-pill', current.badge]">{{ number(rows.length) }}</span></h4>
          <input v-model="query" type="search" class="form-control rss-filter" aria-label="Filter resources" placeholder="Filter by resource or GDA path…">
        </div>
        <div v-if="rows.length" class="table-responsive">
          <table class="table rss-table" :aria-label="`${current.label} resources`">
            <thead><tr><th scope="col">Resource</th><th scope="col">{{ current.detail }}</th></tr></thead>
            <tbody>
              <tr v-for="row in visible" :key="row.id">
                <td>
                  <span class="rss-path" :title="row.resourcePath"><template v-for="(part, index) in segments(row.resource)" :key="index">{{ part }}<wbr></template></span>
                  <span v-if="row.scope === 'common'" class="badge badge-light ml-1">common</span>
                </td>
                <td>
                  <template v-if="row.category === 'missing'">
                    <span v-if="!row.requiredBy.length" class="text-muted">No JSON descriptor</span>
                    <span v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="rss-path d-block">{{ use.descriptor }}:{{ use.line }}</span>
                  </template>
                  <span v-else-if="row.category === 'invalid'">{{ reason(row) }}</span>
                  <template v-else>
                    <span v-for="file in row.gdaFiles" :key="file.absolutePath" class="rss-path d-block" :title="file.absolutePath">
                      <template v-for="(part, index) in segments(file.path)" :key="index">{{ part }}<wbr></template><span v-if="file.tree === 'common'" class="badge badge-light ml-1">common GDA</span>
                    </span>
                    <span v-if="row.mipOnly" class="badge badge-info">differs only in DDS mip levels</span>
                  </template>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="text-muted rss-none">{{ query ? 'No resources match the filter.' : 'No resources in this category.' }}</p>
        <div v-if="rows.length > shown" class="rss-more">
          <span class="text-muted">Showing {{ number(shown) }} of {{ number(rows.length) }}</span>
          <button type="button" class="btn btn-outline-primary btn-sm" @click="shown += PAGE_SIZE">Show {{ number(Math.min(PAGE_SIZE, rows.length - shown)) }} more</button>
        </div>
      </div>
    </div>
  </template>
</template>

<style scoped>
.rss-hint { margin-left: 12px; color: #8a939c; font-size: 12px; }
.rss-progress-title { display: flex; align-items: center; gap: 8px; margin: 0 0 4px; font-weight: 500; }
.rss-progress-title i { font-size: 18px; color: #2277cf; }
.rss-progress-step { margin: 0 0 12px; color: #6c757d; font-size: 13px; }
.rss-progress .progress { height: 6px; }
.rss-alert { display: flex; align-items: flex-start; gap: 10px; }
.rss-alert i { font-size: 18px; line-height: 1.2; }
.rss-alert span { overflow-wrap: anywhere; }
.rss-compared { margin: 0 0 12px; color: #6c757d; font-size: 13px; }
.rss-tiles { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; margin-bottom: 20px; }
.rss-tile { display: flex; flex-direction: column; align-items: flex-start; gap: 2px; min-width: 0; padding: 14px 16px; border: 1px solid #e3e7ec; border-left-width: 4px; border-radius: 8px; background: #fff; color: inherit; font: inherit; text-align: left; cursor: pointer; }
.rss-tile:hover { border-color: #b9c4d0; }
.rss-tile.identical { border-left-color: #19d895; }
.rss-tile.missing { border-left-color: #ffaf00; }
.rss-tile.different { border-left-color: #ff6258; }
.rss-tile.invalid { border-left-color: #3e4b5b; }
.rss-tile.active { background: #f2f7ff; box-shadow: 0 0 0 2px #2277cf inset; }
.rss-tile-label { color: #6c757d; font-size: 12px; }
.rss-tile-value { font-size: 26px; font-weight: 500; line-height: 1.2; }
.rss-tile-hint { color: #8a939c; font-size: 11px; }
.rss-meta { display: grid; grid-template-columns: max-content minmax(0, 1fr); gap: 4px 16px; margin: 0; font-size: 12px; }
.rss-meta dt { color: #6c757d; font-weight: 400; }
.rss-meta dd { margin: 0; overflow-wrap: anywhere; }
.rss-results-heading { display: flex; align-items: center; justify-content: space-between; gap: 12px; flex-wrap: wrap; margin-bottom: 16px; }
.rss-filter { max-width: 340px; height: 34px; font-size: 12px; }
/* The theme keeps table cells on one line; long paths have to wrap inside two equal columns. */
.rss-table { table-layout: fixed; }
.rss-table th { width: 50%; }
.rss-table td { vertical-align: top; white-space: normal; line-height: 1.5; height: auto; }
.rss-path { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; }
.rss-none { margin: 0; }
.rss-more { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
@media (max-width: 991px) { .rss-tiles { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
@media (max-width: 575px) {
  .rss-meta { grid-template-columns: 1fr; }
  .rss-meta dd { margin-bottom: 6px; }
  .rss-filter { max-width: none; }
}
</style>
