<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CheckBox from '../components/CheckBox.vue';
import ReportNotice from '../components/ReportNotice.vue';
import { useSyncReport } from '../composables/useSyncReport';
import { number, plural, time } from '../format';
import type { RssCategory, RssResource } from '../types';
import { busy, config, copy, navigate, openFolder, requestResourceSync, rescan, rssSync } from '../workspace';

// Apart from the workspace's name and folders, everything on this page comes from the workspace's GDA sync report:
// the counts of its comparison and the resources that differ from the GDA folder. Only a "different" resource has a
// GDA file to copy, so only those can be selected and synced.
type Category = Exclude<RssCategory, 'identical'>;
type Filter = 'all' | Category;
const CATEGORIES: Record<Category, { label: string; badge: string }> = {
  different: { label: 'Different', badge: 'badge-danger' },
  missing: { label: 'Missing', badge: 'badge-warning' },
  invalid: { label: 'Invalid', badge: 'badge-dark' },
};
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'different', label: 'Different' }, { key: 'missing', label: 'Missing' }, { key: 'invalid', label: 'Invalid' },
];
const PAGE_SIZE = 200;

const { report, loadError } = useSyncReport();
const query = ref('');
const filter = ref<Filter>('all');
const shown = ref(PAGE_SIZE);
const selected = ref(new Set<string>());

const running = computed(() => !!rssSync.value?.running);
// The newest report file can belong to a failed run; the result shown is then the last successful one before it.
const reportPath = computed(() => rssSync.value?.reportPath ?? null);
const lastRun = computed(() => rssSync.value?.lastRun);
const summary = computed(() => report.value?.summary);
const finishedAt = computed(() => summary.value?.finishedAt ?? report.value?.finishedAt);
const differences = computed(() => report.value?.differences ?? []);
const counts = computed(() => {
  const result = { all: differences.value.length, different: 0, missing: 0, invalid: 0 };
  for (const row of differences.value) if (row.category !== 'identical') result[row.category]++;
  return result;
});

const fileName = (row: RssResource) => row.resource.slice(row.resource.lastIndexOf('/') + 1);
const rows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  // Preserve the report's order by status, then path.
  return differences.value.filter(row => (filter.value === 'all' || row.category === filter.value) &&
    (!needle || row.resource.toLowerCase().includes(needle) || row.gdaFiles.some(file => file.path.toLowerCase().includes(needle))));
});
const visible = computed(() => rows.value.slice(0, shown.value));
watch([filter, query, report], () => { shown.value = PAGE_SIZE; });

const syncable = (row: RssResource) => row.category === 'different' && row.gdaFiles.length > 0;
const pending = computed(() => differences.value.filter(syncable));
// Like the library, only the selected resources that are shown are synced.
const shownSyncable = computed(() => rows.value.filter(syncable));
const selectedRows = computed(() => shownSyncable.value.filter(row => selected.value.has(row.id)));
const hasSelection = computed(() => selected.value.size > 0);
const syncTargets = computed(() => hasSelection.value ? selectedRows.value : pending.value);
const allSelected = computed(() => shownSyncable.value.length > 0 && selectedRows.value.length === shownSyncable.value.length);

// A resource that a new report no longer lists as different leaves the selection.
watch(pending, rows => {
  const ids = new Set(rows.map(row => row.id));
  if ([...selected.value].some(id => !ids.has(id))) selected.value = new Set([...selected.value].filter(id => ids.has(id)));
});

function toggle(id: string) {
  const next = new Set(selected.value);
  if (next.has(id)) next.delete(id); else next.add(id);
  selected.value = next;
}

function toggleAll(select: boolean) {
  const next = new Set(selected.value);
  for (const row of shownSyncable.value) if (select) next.add(row.id); else next.delete(row.id);
  selected.value = next;
}

const category = (row: RssResource) => CATEGORIES[row.category as Category];
const reason = (row: RssResource) => row.status.replace(/^invalid: /, '');
// Long paths wrap after a folder separator rather than inside a name.
const segments = (path: string) => path.split(/(?<=\/)/);
</script>

<template>
  <section class="sync-workspace" aria-labelledby="sync-workspace-heading">
    <div class="sync-workspace-top">
      <div class="sync-workspace-intro">
        <h1 id="sync-workspace-heading">{{ config.name }}<span class="sync-title-dot">.</span></h1>
        <p v-if="reportPath" class="sync-report">Sync data: <span class="sync-report-path" :title="reportPath">{{ reportPath }}</span></p>
        <p v-if="reportPath && lastRun?.state === 'failed'" class="sync-report sync-report-failed">
          <i aria-hidden="true" class="mdi mdi-alert-circle-outline" />The last GDA sync failed: {{ lastRun.error }}<template v-if="summary && finishedAt"> Showing the result from {{ time(finishedAt) }}.</template>
        </p>
        <p v-if="loadError" class="sync-report sync-report-failed"><i aria-hidden="true" class="mdi mdi-alert-circle-outline" />{{ loadError }}</p>
      </div>
      <div class="sync-workspace-actions">
        <button type="button" class="btn btn-primary" :disabled="!!busy || running || !syncTargets.length" @click="requestResourceSync(syncTargets)">
          <i aria-hidden="true" :class="['mdi', busy === 'sync' ? 'mdi-loading mdi-spin' : 'mdi-sync']" /><span>{{ busy === 'sync' ? 'Syncing…' : hasSelection ? 'Sync selected' : 'Sync all pending' }}</span><span v-if="syncTargets.length" class="badge badge-light">{{ number(syncTargets.length) }}</span>
        </button>
        <button type="button" class="btn btn-outline-primary" :disabled="!!busy || running" @click="rescan">
          <i aria-hidden="true" :class="['mdi', busy === 'scan' || running ? 'mdi-loading mdi-spin' : 'mdi-refresh']" /><span>{{ busy === 'scan' ? 'Scanning…' : running ? 'Comparing…' : 'Rescan' }}</span>
        </button>
      </div>
    </div>

    <div v-if="summary" class="sync-metrics">
      <button type="button" class="sync-metric" @click="navigate('rssSync')">
        <span class="sync-metric-icon is-total" aria-hidden="true"><i class="mdi mdi-layers-outline" /></span>
        <span class="sync-metric-copy"><span class="sync-metric-label">Compared</span><span class="sync-metric-value">{{ number(summary.compared) }}<small>game resource{{ plural(summary.compared) }}</small></span></span>
        <i class="mdi mdi-arrow-top-right sync-metric-arrow" aria-hidden="true" />
      </button>
      <button type="button" :class="['sync-metric', { active: filter === 'all' }]" @click="filter = 'all'">
        <span class="sync-metric-icon is-pending" aria-hidden="true"><i class="mdi mdi-sync" /></span>
        <span class="sync-metric-copy"><span class="sync-metric-label">Not in sync</span><span class="sync-metric-value">{{ number(counts.all) }}<small>{{ number(counts.different) }} different · {{ number(counts.missing) }} missing · {{ number(counts.invalid) }} invalid</small></span></span>
      </button>
      <button type="button" class="sync-metric" @click="navigate('rssSync')">
        <span class="sync-metric-icon is-synced" aria-hidden="true"><i class="mdi mdi-check-all" /></span>
        <span class="sync-metric-copy"><span class="sync-metric-label">In sync</span><span class="sync-metric-value">{{ number(summary.identical) }}<small>{{ summary.identicalMipOnly ? `${number(summary.identicalMipOnly)} differ only in DDS mip levels` : 'identical in the GDA folder' }}</small></span></span>
        <i class="mdi mdi-arrow-top-right sync-metric-arrow" aria-hidden="true" />
      </button>
    </div>

    <div class="sync-folders" role="group" aria-label="Sync flow: GDA folder to Game path">
      <button type="button" class="sync-folder-button" :title="config.source" aria-label="Open GDA folder" @click="openFolder('source')">
        <i class="mdi mdi-folder-open-outline sync-folder-icon" aria-hidden="true" />
        <span class="sync-folder-label">GDA folder</span>
        <span class="sync-folder-path">{{ config.source }}</span>
        <i class="mdi mdi-open-in-new sync-folder-open" aria-hidden="true" />
      </button>
      <i class="mdi mdi-arrow-down sync-folder-direction" aria-hidden="true" />
      <button type="button" class="sync-folder-button" :title="config.destination" aria-label="Open Game folder" @click="openFolder('destination')">
        <i class="mdi mdi-folder-outline sync-folder-icon" aria-hidden="true" />
        <span class="sync-folder-label">Game path</span>
        <span class="sync-folder-path">{{ config.destination }}</span>
        <i class="mdi mdi-open-in-new sync-folder-open" aria-hidden="true" />
      </button>
    </div>
    <p v-if="finishedAt" class="sync-last-scan">Compared {{ time(finishedAt) }}</p>
  </section>

  <ReportNotice />

  <template v-if="summary">
    <div v-if="!counts.all" class="card sync-empty grid-margin">
      <div class="card-body">
        <i aria-hidden="true" class="mdi mdi-check-all text-success" />
        <h4>All caught up.</h4>
        <p class="text-muted">Every resource of the game has an identical file in the GDA folder.</p>
      </div>
    </div>

    <template v-else>
      <div class="card grid-margin">
        <div class="card-body sync-controls">
          <div class="btn-group sync-filter" role="group" aria-label="Filter by status">
            <button v-for="item in FILTERS" :key="item.key" type="button" :class="['btn', 'btn-secondary', { active: filter === item.key }]" :aria-pressed="filter === item.key" @click="filter = item.key">
              {{ item.label }} <span class="sync-filter-count">{{ number(counts[item.key]) }}</span>
            </button>
          </div>
          <div class="sync-search">
            <i aria-hidden="true" class="mdi mdi-magnify" />
            <input v-model="query" type="search" class="form-control" aria-label="Search resources not in sync" placeholder="Search by resource or GDA path…">
          </div>
        </div>
      </div>

      <div v-if="rows.length" class="card grid-margin">
        <div class="card-body">
          <div class="table-responsive">
            <table class="table sync-table" aria-label="Resources not in sync">
              <thead>
                <tr>
                  <th scope="col">
                    <CheckBox v-if="shownSyncable.length" :checked="allSelected" label="Select all shown different resources" @change="toggleAll" />
                    <span v-else class="sr-only">Select</span>
                  </th>
                  <th scope="col">Resource</th><th scope="col">Status</th><th scope="col">GDA files, declarations or reason</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="row in visible" :key="row.id" :class="{ selected: selected.has(row.id) }">
                  <td><CheckBox v-if="syncable(row)" :checked="selected.has(row.id)" :label="`Select ${row.resource}`" @change="toggle(row.id)" /></td>
                  <td>
                    <span class="sync-path" :title="row.resourcePath"><template v-for="(part, index) in segments(row.resource)" :key="index">{{ part }}<wbr></template></span>
                    <span v-if="row.scope === 'common'" class="badge badge-light ml-1">common</span>
                    <button type="button" class="sync-copy" :aria-label="`Copy the game path of ${fileName(row)}`" title="Copy the game path" @click="copy(row.resourcePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
                  </td>
                  <td><span :class="['badge', category(row).badge]">{{ category(row).label }}</span></td>
                  <td>
                    <template v-if="row.category === 'missing'">
                      <span v-if="!row.requiredBy.length" class="text-muted">No JSON descriptor</span>
                      <span v-for="use in row.requiredBy" :key="`${use.descriptor}:${use.line}`" class="sync-path d-block">{{ use.descriptor }}:{{ use.line }}</span>
                    </template>
                    <span v-else-if="row.category === 'invalid'">{{ reason(row) }}</span>
                    <template v-else>
                      <span v-for="file in row.gdaFiles" :key="file.absolutePath" class="sync-path d-block" :title="file.absolutePath">
                        <template v-for="(part, index) in segments(file.path)" :key="index">{{ part }}<wbr></template><span v-if="file.tree === 'common'" class="badge badge-light ml-1">common GDA</span>
                        <button type="button" class="sync-copy" :aria-label="`Copy the GDA path ${file.path}`" title="Copy the GDA path" @click="copy(file.absolutePath)"><i aria-hidden="true" class="mdi mdi-content-copy" /></button>
                      </span>
                    </template>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
          <div v-if="rows.length > shown" class="sync-more">
            <span class="text-muted">Showing {{ number(shown) }} of {{ number(rows.length) }}</span>
            <button type="button" class="btn btn-outline-primary btn-sm" @click="shown += PAGE_SIZE">Show {{ number(Math.min(PAGE_SIZE, rows.length - shown)) }} more</button>
          </div>
        </div>
      </div>
      <div v-else class="card sync-none grid-margin">
        <div class="card-body text-muted">
          <i aria-hidden="true" class="mdi mdi-magnify" />
          <p>No resources match.</p>
          <button type="button" class="btn btn-link p-0" @click="query = ''; filter = 'all'">Clear search and filter</button>
        </div>
      </div>
    </template>
  </template>
</template>

<style scoped>
.sync-empty .card-body { padding: 56px 24px; text-align: center; }
.sync-empty i { display: block; margin-bottom: 12px; font-size: 44px; line-height: 1; }
.sync-empty h4 { margin-bottom: 6px; }
.sync-empty p { margin: 0; }

.sync-workspace { margin-bottom: 22px; }
.sync-workspace-top { display: flex; align-items: center; justify-content: space-between; gap: 24px; margin-bottom: 24px; }
.sync-workspace-intro { min-width: 0; }
h1 { margin: 0 0 10px; font-size: clamp(26px, 2.6vw, 34px); line-height: 1.2; font-weight: 500; letter-spacing: -0.8px; overflow-wrap: anywhere; }
.sync-title-dot { color: #85a777; }
.sync-report { margin: 0; color: #87909b; font-size: 12px; line-height: 1.5; overflow-wrap: anywhere; }
.sync-report-path { font-family: monospace; }
.sync-report-failed { margin-top: 4px; color: #d2453c; }
.sync-report i { margin-right: 6px; font-size: 14px; vertical-align: -2px; }
.sync-workspace-actions { display: flex; flex-shrink: 0; flex-wrap: wrap; gap: 10px; }
.sync-workspace-actions .btn { display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 40px; border-radius: 7px; white-space: nowrap; }
.sync-workspace-actions .btn i.mdi { display: inline-flex; flex-shrink: 0; margin: 0; font-size: 16px; line-height: 1; }
.sync-workspace-actions .btn .badge { flex-shrink: 0; }
.sync-workspace-actions .btn-outline-primary { background: #fff; border-color: #dce2dc; color: #5d7063; }
.sync-workspace-actions .btn-outline-primary:hover:not(:disabled) { background: #f1f5f1; }
.sync-metrics { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.sync-metric { display: flex; position: relative; align-items: center; gap: 14px; min-width: 0; padding: 20px 18px; border: 1px solid #e0e5de; border-radius: 9px; background: #fff; color: #29383b; text-align: left; font-family: inherit; cursor: pointer; transition: border-color 0.15s; }
.sync-metric:hover { border-color: #aebcac; }
.sync-metric-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 42px; height: 44px; border-radius: 10px; font-size: 24px; }
.sync-metric-icon.is-total { color: #828d70; background: #f0f2eb; }
.sync-metric-icon.is-pending { color: #cc8a43; background: #fdf1e5; }
.sync-metric-icon.is-synced { color: #80a263; background: #edf4e6; }
.sync-metric-copy { display: block; min-width: 0; }
.sync-metric-label { display: block; margin-bottom: 6px; color: #8a968d; font-size: 11px; }
.sync-metric-value { display: flex; align-items: baseline; flex-wrap: wrap; column-gap: 9px; row-gap: 2px; font-size: 28px; font-weight: 500; line-height: 1.15; letter-spacing: -0.7px; }
.sync-metric-value small { font-size: 10px; font-weight: 400; color: #97a098; letter-spacing: 0; line-height: 1.4; }
.sync-metric-arrow { position: absolute; right: 14px; top: 14px; color: #a5b199; font-size: 17px; }
.sync-folders { position: relative; display: grid; gap: 16px; padding: 12px 16px; background: #f0f3ed; border: 1px solid #e0e5de; border-radius: 8px; }
.sync-folder-button { display: grid; grid-template-columns: 34px 90px minmax(0, 1fr) 18px; align-items: center; gap: 12px; min-width: 0; padding: 0; background: transparent; border: 0; color: #7e896f; text-align: left; cursor: pointer; }
.sync-folder-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 34px; height: 34px; border: 1px solid #dee5d5; border-radius: 7px; font-size: 21px; background: #e9eee1; }
.sync-folder-label { font-size: 8px; font-weight: 500; text-transform: uppercase; letter-spacing: 1.4px; }
.sync-folder-path { display: block; font-family: monospace; font-size: 11px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.sync-folder-open { font-size: 16px; }
.sync-folder-direction { position: absolute; left: 25px; top: 50%; transform: translateY(-50%); color: #9eae92; font-size: 16px; line-height: 1; }
.sync-last-scan { margin: 8px 0 0; color: #929aa1; font-size: 11px; text-align: right; }
.sync-filter { flex: 0 1 auto; flex-wrap: wrap; }
.sync-filter .btn { white-space: nowrap; }
.sync-filter-count { margin-left: 4px; opacity: 0.7; }

.sync-controls { display: flex; flex-wrap: wrap; align-items: center; gap: 12px; padding: 14px 16px; }
.sync-search { position: relative; flex: 1 1 220px; min-width: 0; }
.sync-search i { position: absolute; top: 50%; left: 12px; transform: translateY(-50%); color: #97a098; font-size: 18px; pointer-events: none; }
.sync-search input { padding-left: 38px; }
/* The theme keeps table cells on one line; long paths have to wrap. Narrow screens scroll the table instead. */
.sync-table { min-width: 660px; table-layout: fixed; }
.sync-table th:nth-child(1) { width: 44px; }
.sync-table th:nth-child(3) { width: 104px; }
.sync-table .form-check { margin: 0; }
.sync-table tr.selected td { background: #f2f7ff; }
.sync-table td { vertical-align: top; white-space: normal; line-height: 1.5; height: auto; }
.sync-path { font-family: monospace; font-size: 12px; overflow-wrap: anywhere; }
.sync-copy { padding: 0 4px; border: 0; border-radius: 4px; background: transparent; color: #9aa3ad; font-size: 13px; line-height: 1; cursor: pointer; }
.sync-copy:hover { background: #ebedf2; color: #4b49ac; }
.sync-more { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
.sync-none .card-body { padding: 40px 20px; text-align: center; }
.sync-none i { font-size: 32px; }
.sync-none p { margin: 6px 0 8px; }

@media (max-width: 1199px) { .sync-metric { padding: 18px 12px; gap: 10px; } .sync-metric-value { font-size: 25px; } }
@media (max-width: 767px) {
  .sync-workspace-top { flex-direction: column; align-items: flex-start; gap: 16px; }
  .sync-metrics { grid-template-columns: 1fr; gap: 10px; }
  .sync-metric { padding: 16px; }
}
@media (max-width: 575px) {
  .sync-folder-button { grid-template-columns: 34px minmax(0, 1fr) 18px; column-gap: 10px; row-gap: 4px; }
  .sync-folder-icon { grid-column: 1; grid-row: 1 / 3; }
  .sync-folder-label { grid-column: 2; grid-row: 1; }
  .sync-folder-path { grid-column: 2; grid-row: 2; }
  .sync-folder-open { grid-column: 3; grid-row: 1 / 3; }
}
</style>
