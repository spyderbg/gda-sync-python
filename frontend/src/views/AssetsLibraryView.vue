<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import AssetCard from '../components/AssetCard.vue';
import AssetDetails from '../components/AssetDetails.vue';
import ButtonTooltip from '../components/ButtonTooltip.vue';
import ReportThumbnail from '../components/ReportThumbnail.vue';
import WorkspaceHeader from '../components/WorkspaceHeader.vue';
import { useAssetReport } from '../composables/useAssetReport';
import { assetBadges, assetMatches, baseName, declarationLabel, number, size, splitPath } from '../format';
import type { AssetCategory, ReportAsset } from '../types';
import { assetReport, busy, generateAssetReport, ui } from '../workspace';

// The asset library shows the newest asset report of the workspace's game: every asset that its descriptors declare,
// with the entries that load it, and the files of the game folder that nothing declares. Rescan writes a new
// one. The sidebar's types, the status filters and the search narrow the assets down.
type Filter = 'all' | AssetCategory;
const FILTERS: { key: Filter; label: string; hint: string }[] = [
  {
    key: 'all', label: 'All',
    hint: 'Every asset of the newest asset report: each file that the game\'s *Data.json descriptors (or the workspace\'s '
      + 'resource_paths) declare, and each file of the game folder with a compared extension that nothing declares.\n\n'
      + 'An image sequence is one asset with its frames, as in the GDA sync. Rescan reads the game again.',
  },
  {
    key: 'available', label: 'Available',
    hint: 'A descriptor declares the file and it exists, so the game can load it.\n\n'
      + 'An image sequence is available when every one of its files exists.',
  },
  {
    key: 'missing', label: 'Missing',
    hint: 'A descriptor declares the file, but it does not exist in the game, so the game cannot load it.\n\n'
      + 'An image sequence is missing when any of its files does not exist and none is invalid.',
  },
  {
    key: 'invalid', label: 'Invalid',
    hint: 'A descriptor declares a path that leads outside the resources folder that holds the game folder, so the file '
      + 'is not read.\n\nAn image sequence is invalid when any of its files is.',
  },
  {
    key: 'supplementary', label: 'Supplementary',
    hint: 'A file in the game folder, with a compared extension, that no descriptor declares, so the game does not load '
      + 'it.\n\nNumbered images in one folder with the same name and extension, at least five numbers in a row, are '
      + 'guessed to be one image sequence.',
  },
];
const PAGE_SIZE = 200;
// The asset report version this release writes, ASSET_REPORT_VERSION in egt_gda_sync/asset_report.py.
const REPORT_VERSION = 4;

const { report, loadError } = useAssetReport();
const filter = ref<Filter>('all');
const shown = ref(PAGE_SIZE);
const state = computed(() => (!assetReport.value?.reportPath ? 'none' : loadError.value ? 'error' : report.value ? 'ready' : 'loading'));
const revision = computed(() => report.value?.summary.finishedAt ?? '');
const outdated = computed(() => !!assetReport.value?.reportPath && (assetReport.value.version ?? 1) < REPORT_VERSION);
// What an earlier version did not report: fonts before version 2, RTFs before version 3, and views before version 4.
const outdatedTypes = computed(() => {
  const version = assetReport.value?.version ?? 1;
  return version < 2 ? 'fonts, RTFs and views' : version < 3 ? 'RTFs and views' : 'views';
});
const assets = computed(() => report.value?.assets ?? []);
// The sidebar's type narrows the assets that the status filters count.
const typed = computed(() => assets.value.filter(row => ui.category === 'all' || row.type === ui.category));
const counts = computed(() => {
  const result: Record<Filter, number> = { all: typed.value.length, available: 0, missing: 0, invalid: 0, supplementary: 0 };
  for (const row of typed.value) result[row.category]++;
  return result;
});
const rows = computed(() => {
  const needle = ui.query.trim().toLowerCase();
  return typed.value.filter(row => (filter.value === 'all' || row.category === filter.value) && assetMatches(row, needle));
});
const visible = computed(() => rows.value.slice(0, shown.value));
watch([filter, () => ui.query, () => ui.category, report], () => { shown.value = PAGE_SIZE; });

// Clicking an asset shows its details; a new report that no longer lists it closes them.
const detailsRow = computed(() => (ui.inspecting ? assets.value.find(row => row.id === ui.inspecting) ?? null : null));
// A row of the list shows the file of the asset, a sequence's first frame, or the background of an RTF's first
// page that has one, else its .rtf file.
function listFile(row: ReportAsset) {
  const page = readable(row) ? row.rtf?.pages.find(item => item.found && item.background) : undefined;
  if (page?.background) return { resourcePath: page.background, resource: baseName(page.background), category: row.category };
  if (row.directory) return { resourcePath: row.directory.project, resource: baseName(row.directory.project), category: row.category };
  return row.sequence?.frames[0] ?? row;
}
const readable = (row: { category: AssetCategory }) => row.category === 'available' || row.category === 'supplementary';

function showAll() {
  ui.query = '';
  ui.category = 'all';
  filter.value = 'all';
}
</script>

<template>
  <WorkspaceHeader v-model:filter="filter" />

  <div v-if="state !== 'ready'" class="card empty-state grid-margin">
    <div class="card-body">
      <i aria-hidden="true" :class="['mdi', state === 'loading' ? 'mdi-loading mdi-spin text-muted' : state === 'error' ? 'mdi-alert-circle-outline text-danger' : 'mdi-file-document-outline text-muted']" />
      <h4>{{ state === 'loading' ? 'Loading the asset report…' : state === 'error' ? 'The asset report could not be loaded' : 'No asset report yet' }}</h4>
      <p class="text-muted">{{ state === 'error' ? loadError : 'Rescan lists the game\'s assets: every file that its descriptors declare, with the entries that load it, and the files of the game folder that nothing declares.' }}</p>
    </div>
  </div>

  <template v-else>
    <div v-if="outdated" class="alert alert-info library-outdated" role="note">
      <i aria-hidden="true" class="mdi mdi-information-outline" />This report was written by an earlier version, which counted {{ outdatedTypes }} as other files and did not read them. Rescan to update it.
    </div>
    <div class="library-controls">
      <div class="library-filter-toolbar" role="group" aria-label="Asset filters and layout">
        <div class="btn-group toolbar-item" role="group" aria-label="Layout">
          <button type="button" :class="['btn', 'btn-secondary', { active: ui.layout === 'grid' }]" aria-label="Grid view" :aria-pressed="ui.layout === 'grid'" @click="ui.layout = 'grid'"><i aria-hidden="true" class="mdi mdi-view-grid-outline" /></button>
          <button type="button" :class="['btn', 'btn-secondary', { active: ui.layout === 'list' }]" aria-label="List view" :aria-pressed="ui.layout === 'list'" @click="ui.layout = 'list'"><i aria-hidden="true" class="mdi mdi-view-list-outline" /></button>
        </div>
        <div class="btn-group library-status-filter" role="group" aria-label="Filter by status">
          <ButtonTooltip v-for="item in FILTERS" :key="item.key" :text="item.hint" v-slot="{ bindings }">
            <button v-bind="bindings" type="button" :class="['btn', 'btn-secondary', { active: filter === item.key }]" :aria-pressed="filter === item.key" @click="filter = item.key">
              {{ item.label }} <span class="library-filter-count">{{ number(counts[item.key]) }}</span>
            </button>
          </ButtonTooltip>
        </div>
        <form class="asset-search" role="search" @submit.prevent>
          <div class="form-group search-field">
            <i aria-hidden="true" class="mdi mdi-magnify" />
            <input v-model="ui.query" type="text" class="form-control" data-asset-search aria-label="Search assets" placeholder="Search paths, ids or sequences…">
            <button v-if="ui.query" type="button" class="search-clear" aria-label="Clear search" @click="ui.query = ''"><i aria-hidden="true" class="mdi mdi-close" /></button>
            <kbd v-else class="search-shortcut">Ctrl K</kbd>
          </div>
        </form>
      </div>
    </div>

    <div class="results-heading">
      <span>{{ number(rows.length) }} of {{ number(counts.all) }} assets<small v-if="ui.query" class="text-muted"> matching “{{ ui.query }}”</small></span>
    </div>

    <div v-if="rows.length && ui.layout === 'grid'" class="row asset-grid">
      <div v-for="row in visible" :key="row.id" class="col-sm-6 col-xl-4 grid-margin stretch-card">
        <AssetCard :row="row" :revision="revision" :inspected="ui.inspecting === row.id" @open="ui.inspecting = row.id" />
      </div>
    </div>
    <div v-else-if="rows.length" class="card asset-list grid-margin">
      <div class="table-responsive">
        <table class="table table-hover mb-0">
          <thead>
            <tr><th>Asset</th><th class="d-none d-md-table-cell">Folder</th><th>Status</th><th class="d-none d-lg-table-cell">Loaded by</th><th class="text-right">Size</th></tr>
          </thead>
          <tbody>
            <tr v-for="row in visible" :key="row.id" :class="['asset-card', 'asset-row', { inspected: ui.inspecting === row.id }]">
              <td>
                <button type="button" class="asset-hit-target" :aria-label="`Inspect ${splitPath(row.resource).name}`" @click="ui.inspecting = row.id">
                  <ReportThumbnail :file="listFile(row).resourcePath" :name="splitPath(listFile(row).resource).name" :revision="revision" :preview="readable(listFile(row))" />
                  <span class="asset-name">{{ splitPath(row.resource).name }}</span>
                </button>
              </td>
              <td class="d-none d-md-table-cell text-muted">{{ splitPath(row.resource).folder }}</td>
              <td><span :class="['badge', assetBadges[row.category]]">{{ row.category }}</span></td>
              <td class="d-none d-lg-table-cell text-muted library-use">
                {{ row.requiredBy.length ? declarationLabel(row.requiredBy[0]) + (row.requiredBy.length > 1 ? ` +${row.requiredBy.length - 1}` : '') : '—' }}
              </td>
              <td class="text-right text-nowrap">{{ row.size !== undefined ? size(row.size) : '—' }}</td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
    <div v-else class="card empty-state grid-margin">
      <div class="card-body">
        <i aria-hidden="true" class="mdi mdi-magnify text-muted" />
        <h4>No assets found</h4>
        <p class="text-muted">{{ assets.length ? 'Try a different search or clear your filters.' : 'The game folder has no assets.' }}</p>
        <button type="button" class="btn btn-outline-primary" @click="showAll">Show all assets</button>
      </div>
    </div>
    <div v-if="rows.length > shown" class="library-more grid-margin">
      <span class="text-muted">Showing {{ number(shown) }} of {{ number(rows.length) }}</span>
      <button type="button" class="btn btn-outline-primary btn-sm" @click="shown += PAGE_SIZE">Show {{ number(Math.min(PAGE_SIZE, rows.length - shown)) }} more</button>
    </div>
  </template>

  <AssetDetails v-if="detailsRow" :row="detailsRow" :revision="revision" @close="ui.inspecting = null" />
</template>

<style scoped>
.library-controls { margin-bottom: 22px; }
.asset-search { flex: 1; min-width: 220px; max-width: 340px; margin-left: auto; }
@media (max-width: 767px) { .asset-search { flex-basis: 100%; max-width: none; } }
.library-filter-toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 14px 16px; border: 1px solid #e0e5e9; border-radius: 8px; background: #fff; }
.library-filter-toolbar > .btn-group { flex-shrink: 0; }
.library-status-filter { flex-wrap: wrap; }
.library-status-filter .btn { white-space: nowrap; }
.library-filter-count { margin-left: 4px; opacity: 0.7; }
.library-use { max-width: 320px; font-family: monospace; font-size: 11px; overflow-wrap: anywhere; }
.library-outdated { display: flex; align-items: center; gap: 8px; }
.library-more { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; }
</style>
