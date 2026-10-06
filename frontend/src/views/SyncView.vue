<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import CheckBox from '../components/CheckBox.vue';
import ReportNotice from '../components/ReportNotice.vue';
import ResourceCard from '../components/ResourceCard.vue';
import { useSyncReport } from '../composables/useSyncReport';
import { number, plural, rowMatches, time } from '../format';
import type { RssCategory, RssResource } from '../types';
import { busy, config, navigate, openFolder, requestResourceSync, rescan, rssSync } from '../workspace';

// Apart from the workspace's folders, everything on this page comes from the workspace's GDA sync report:
// the counts of its comparison and the resources that differ from the GDA folder, then the supplementary files, which
// no descriptor declares. Only a "different" resource has a GDA file to copy, so only those can be selected and synced.
type Category = Exclude<RssCategory, 'identical'>;
type Filter = 'all' | Category;
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'different', label: 'Different' }, { key: 'missing', label: 'Missing' }, { key: 'invalid', label: 'Invalid' },
  { key: 'supplementary', label: 'Supplementary' },
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
  const result = { all: differences.value.length, different: 0, missing: 0, invalid: 0, supplementary: 0 };
  for (const row of differences.value) if (row.category !== 'identical') result[row.category]++;
  return result;
});

const rows = computed(() => {
  const needle = query.value.trim().toLowerCase();
  // Preserve the report's order by status, then path.
  return differences.value.filter(row => (filter.value === 'all' || row.category === filter.value) && rowMatches(row, needle));
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
</script>

<template>
  <section class="sync-workspace" aria-label="Sync workspace">
    <div class="sync-workspace-top">
      <div class="sync-workspace-intro">
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
        <span class="sync-metric-copy"><span class="sync-metric-label">Not in sync</span><span class="sync-metric-value">{{ number(counts.different + counts.missing + counts.invalid) }}<small>{{ number(counts.different) }} different · {{ number(counts.missing) }} missing · {{ number(counts.invalid) }} invalid</small></span></span>
      </button>
      <button type="button" class="sync-metric" @click="navigate('rssSync')">
        <span class="sync-metric-icon is-synced" aria-hidden="true"><i class="mdi mdi-check-all" /></span>
        <span class="sync-metric-copy"><span class="sync-metric-label">In sync</span><span class="sync-metric-value">{{ number(summary.identical) }}<small>{{ summary.identicalMipOnly ? `${number(summary.identicalMipOnly)} differ only in DDS mip levels` : 'identical in the GDA folder' }}</small></span></span>
        <i class="mdi mdi-arrow-top-right sync-metric-arrow" aria-hidden="true" />
      </button>
      <button type="button" :class="['sync-metric', { active: filter === 'supplementary' }]" @click="filter = 'supplementary'">
        <span class="sync-metric-icon is-supplementary" aria-hidden="true"><i class="mdi mdi-file-question-outline" /></span>
        <span class="sync-metric-copy"><span class="sync-metric-label">Supplementary</span><span class="sync-metric-value">{{ number(counts.supplementary) }}<small>in the game, in no descriptor</small></span></span>
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
        <p class="text-muted">Every resource of the game has an identical file in the GDA folder, and every file of the game is declared.</p>
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
            <input v-model="query" type="search" class="form-control" aria-label="Search resources not in sync" placeholder="Search by resource, GDA path or sequence…">
          </div>
        </div>
      </div>

      <template v-if="rows.length">
        <div class="results-heading">
          <CheckBox v-if="shownSyncable.length" :checked="allSelected" label="Select all shown different resources" @change="toggleAll">
            {{ selectedRows.length ? `${number(selectedRows.length)} selected` : `${number(rows.length)} of ${number(counts.all)} resources` }}<small v-if="query" class="text-muted"> matching “{{ query }}”</small>
          </CheckBox>
          <span v-else>{{ number(rows.length) }} of {{ number(counts.all) }} resources<small v-if="query" class="text-muted"> matching “{{ query }}”</small></span>
        </div>
        <!-- A different resource spans the row, so its GDA files sit beside the game file. -->
        <div class="row asset-grid">
          <div v-for="row in visible" :key="row.id" :class="[row.category === 'different' ? 'col-12' : 'col-sm-6 col-xl-4', 'grid-margin', 'stretch-card']">
            <ResourceCard :row="row" :revision="finishedAt ?? ''" :selected="selected.has(row.id)" @toggle="toggle(row.id)" />
          </div>
        </div>
        <div v-if="rows.length > shown" class="sync-more grid-margin">
          <span class="text-muted">Showing {{ number(shown) }} of {{ number(rows.length) }}</span>
          <button type="button" class="btn btn-outline-primary btn-sm" @click="shown += PAGE_SIZE">Show {{ number(Math.min(PAGE_SIZE, rows.length - shown)) }} more</button>
        </div>
      </template>
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
.sync-metrics { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; margin-bottom: 20px; }
.sync-metric { display: flex; position: relative; align-items: center; gap: 14px; min-width: 0; padding: 20px 18px; border: 1px solid #e0e5de; border-radius: 9px; background: #fff; color: #29383b; text-align: left; font-family: inherit; cursor: pointer; transition: border-color 0.15s; }
.sync-metric:hover { border-color: #aebcac; }
.sync-metric-icon { display: flex; align-items: center; justify-content: center; flex-shrink: 0; width: 42px; height: 44px; border-radius: 10px; font-size: 24px; }
.sync-metric-icon.is-total { color: #828d70; background: #f0f2eb; }
.sync-metric-icon.is-pending { color: #cc8a43; background: #fdf1e5; }
.sync-metric-icon.is-synced { color: #80a263; background: #edf4e6; }
.sync-metric-icon.is-supplementary { color: #8862e0; background: #f1ebfc; }
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
