<script setup lang="ts">
import AssetCard from '../components/AssetCard.vue';
import AssetDetails from '../components/AssetDetails.vue';
import AssetThumbnail from '../components/AssetThumbnail.vue';
import WorkspaceHeader from '../components/WorkspaceHeader.vue';
import { size, time } from '../format';
import { data, filtered, inspected, ui } from '../workspace';

// The asset library browses the files of the workspace's game folder; syncing them with the GDA is on the Sync page.
function showAll() {
  ui.query = '';
  ui.category = 'all';
}
</script>

<template>
  <WorkspaceHeader />
  <div class="library-controls">
    <div class="library-filter-toolbar" role="group" aria-label="Asset filters and layout">
      <div class="btn-group toolbar-item" role="group" aria-label="Layout">
        <button type="button" :class="['btn', 'btn-secondary', { active: ui.layout === 'grid' }]" aria-label="Grid view" :aria-pressed="ui.layout === 'grid'" @click="ui.layout = 'grid'"><i aria-hidden="true" class="mdi mdi-view-grid-outline" /></button>
        <button type="button" :class="['btn', 'btn-secondary', { active: ui.layout === 'list' }]" aria-label="List view" :aria-pressed="ui.layout === 'list'" @click="ui.layout = 'list'"><i aria-hidden="true" class="mdi mdi-view-list-outline" /></button>
      </div>
      <form class="asset-search" role="search" @submit.prevent>
        <div class="form-group search-field">
          <i aria-hidden="true" class="mdi mdi-magnify" />
          <input v-model="ui.query" type="text" class="form-control" data-asset-search aria-label="Search assets" placeholder="Search assets, names, or folders…">
          <button v-if="ui.query" type="button" class="search-clear" aria-label="Clear search" @click="ui.query = ''"><i aria-hidden="true" class="mdi mdi-close" /></button>
          <kbd v-else class="search-shortcut">Ctrl K</kbd>
        </div>
      </form>
    </div>
  </div>

  <div v-if="data!.warnings.length" class="alert alert-warning" role="status">
    {{ data!.warnings.length }} files skipped during scan.
    <details><summary>View details</summary><p v-for="warning in data!.warnings" :key="warning" class="mb-1">{{ warning }}</p></details>
  </div>

  <div class="results-heading">
    <span>{{ filtered.length }} assets<small v-if="ui.query" class="text-muted"> matching “{{ ui.query }}”</small></span>
  </div>

  <div v-if="filtered.length && ui.layout === 'grid'" class="row asset-grid">
    <div v-for="asset in filtered" :key="asset.id" class="col-sm-6 col-xl-4 grid-margin stretch-card">
      <AssetCard :asset="asset" :revision="data!.scannedAt" :inspected="ui.inspecting === asset.id" @open="ui.inspecting = asset.id" />
    </div>
  </div>
  <div v-else-if="filtered.length" class="card asset-list grid-margin">
    <div class="table-responsive">
      <table class="table table-hover mb-0">
        <thead>
          <tr><th>Asset</th><th class="d-none d-md-table-cell">Folder</th><th>Format</th><th class="text-right">Size</th><th class="d-none d-xl-table-cell">Modified</th></tr>
        </thead>
        <tbody>
          <tr v-for="asset in filtered" :key="asset.id" :class="['asset-card', 'asset-row', { inspected: ui.inspecting === asset.id }]">
            <td>
              <button type="button" class="asset-hit-target" :aria-label="`Inspect ${asset.name}`" @click="ui.inspecting = asset.id">
                <AssetThumbnail :asset="asset" :revision="data!.scannedAt" /><span class="asset-name">{{ asset.name }}</span>
              </button>
            </td>
            <td class="d-none d-md-table-cell text-muted">{{ asset.folder }}</td>
            <td class="text-nowrap text-muted">{{ asset.extension.toUpperCase() }}<template v-if="asset.dimensions"> · {{ asset.dimensions.width }} × {{ asset.dimensions.height }}</template></td>
            <td class="text-right text-nowrap">{{ size(asset.size) }}</td>
            <td class="text-nowrap text-muted d-none d-xl-table-cell">{{ time(asset.modifiedAt) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
  <div v-else class="card empty-state grid-margin">
    <div class="card-body">
      <i aria-hidden="true" class="mdi mdi-magnify text-muted" />
      <h4>No assets found</h4>
      <p class="text-muted">{{ data!.assets.length ? 'Try a different search or clear your filters.' : 'The game folder has no files yet.' }}</p>
      <button type="button" class="btn btn-outline-primary" @click="showAll">Show all assets</button>
    </div>
  </div>

  <!-- Clicking an asset shows its details. -->
  <AssetDetails v-if="inspected" :asset="inspected" :revision="data!.scannedAt" @close="ui.inspecting = null" />
</template>

<style scoped>
.library-controls { margin-bottom: 22px; }
.asset-search { flex: 1; min-width: 220px; max-width: 340px; margin-left: auto; }
@media (max-width: 767px) { .asset-search { flex-basis: 100%; max-width: none; } }
.library-filter-toolbar { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; padding: 14px 16px; border: 1px solid #e0e5e9; border-radius: 8px; background: #fff; }
.library-filter-toolbar > .btn-group { flex-shrink: 0; }
</style>
