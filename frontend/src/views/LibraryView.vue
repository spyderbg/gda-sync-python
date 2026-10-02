<script setup lang="ts">
import { computed } from 'vue';
import AssetThumbnail from '../components/AssetThumbnail.vue';
import CheckBox from '../components/CheckBox.vue';
import PageHeader from '../components/PageHeader.vue';
import StatusBadge from '../components/StatusBadge.vue';
import { ASSET_TYPES, size, time, typeIcons, typeNames } from '../format';
import type { Asset, AssetType } from '../types';
import {
  PAGE_NAMES, allVisibleSelected, busy, data, filtered, formats, inspected, pending, requestSync, rescan,
  selectedPending, setVisibleSelected, toggleSelected, ui,
} from '../workspace';
import AssetInspector from './AssetInspector.vue';

const caughtUp = computed(() => ui.view === 'pending' && !ui.query);
const dimensions = (asset: Asset) => (asset.dimensions ? `${asset.dimensions.width} × ${asset.dimensions.height}` : asset.extension.toUpperCase());

function chooseCategory(type: AssetType | 'all') {
  ui.category = type;
  ui.selected = new Set();
}

function showAll() {
  ui.query = '';
  ui.category = 'all';
  ui.status = 'all';
  ui.format = 'all';
  if (ui.view === 'pending') ui.view = 'library';
}
</script>

<template>
  <PageHeader :title="PAGE_NAMES[ui.view]">
    <template #links>
      <li><a href="#" :class="{ active: ui.category === 'all' }" @click.prevent="chooseCategory('all')">All assets</a></li>
      <li v-for="type in ASSET_TYPES" :key="type"><a href="#" :class="{ active: ui.category === type }" @click.prevent="chooseCategory(type)">{{ typeNames[type] }}</a></li>
    </template>
    <template #links-right>
      <li><span class="scan-time">Last scanned {{ time(data!.scannedAt) }}</span></li>
    </template>
    <template #toolbar>
      <div class="btn-group toolbar-item" role="group" aria-label="Layout">
        <button type="button" :class="['btn', 'btn-secondary', { active: ui.layout === 'grid' }]" aria-label="Grid view" :aria-pressed="ui.layout === 'grid'" @click="ui.layout = 'grid'"><i aria-hidden="true" class="mdi mdi-view-grid-outline" /></button>
        <button type="button" :class="['btn', 'btn-secondary', { active: ui.layout === 'list' }]" aria-label="List view" :aria-pressed="ui.layout === 'list'" @click="ui.layout = 'list'"><i aria-hidden="true" class="mdi mdi-view-list-outline" /></button>
      </div>
      <div class="filter-wrapper">
        <select v-model="ui.status" class="form-control toolbar-item" aria-label="Filter by status">
          <option value="all">All statuses</option><option value="new">New assets</option><option value="modified">Modified</option><option value="synced">In sync</option>
        </select>
        <select v-model="ui.format" class="form-control toolbar-item" aria-label="Filter by file format">
          <option value="all">All formats</option><option v-for="extension in formats" :key="extension" :value="extension">{{ extension.toUpperCase() }}</option>
        </select>
        <select v-model="ui.sort" class="form-control toolbar-item" aria-label="Sort assets">
          <option value="recent">Recently modified</option><option value="name">Name A–Z</option><option value="size">Largest first</option>
        </select>
      </div>
      <div class="sort-wrapper">
        <button type="button" class="btn btn-secondary toolbar-item ml-lg-auto" :disabled="!!busy" @click="rescan">
          <i aria-hidden="true" :class="['mdi', busy === 'scan' ? 'mdi-loading mdi-spin' : 'mdi-refresh']" />Rescan
        </button>
        <button type="button" class="btn btn-primary toolbar-item ml-3" :disabled="!!busy || !pending.length" @click="requestSync(pending.map(asset => asset.id))">
          <i aria-hidden="true" :class="['mdi', busy === 'sync' ? 'mdi-loading mdi-spin' : 'mdi-sync']" />{{ busy === 'sync' ? 'Syncing…' : 'Sync all pending' }}<span v-if="pending.length" class="badge badge-light ml-2">{{ pending.length }}</span>
        </button>
      </div>
    </template>
  </PageHeader>

  <form class="d-md-none mb-3" role="search" @submit.prevent>
    <input v-model="ui.query" type="text" class="form-control" data-asset-search aria-label="Search assets" placeholder="Search assets, names, or folders…">
  </form>
  <div v-if="data!.warnings.length" class="alert alert-warning" role="status">
    {{ data!.warnings.length }} files skipped during scan.
    <details><summary>View details</summary><p v-for="warning in data!.warnings" :key="warning" class="mb-1">{{ warning }}</p></details>
  </div>

  <div class="results-heading">
    <CheckBox :checked="allVisibleSelected" label="Select all visible assets" @change="setVisibleSelected">
      {{ ui.selected.size ? `${ui.selected.size} selected` : `${filtered.length} assets` }}<small v-if="ui.query" class="text-muted"> matching “{{ ui.query }}”</small>
    </CheckBox>
  </div>

  <div class="row">
    <div :class="inspected ? 'col-lg-7 col-xl-8' : 'col-12'">
      <div v-if="filtered.length && ui.layout === 'grid'" class="row asset-grid">
        <div v-for="asset in filtered" :key="asset.id" class="col-sm-6 col-xl-4 grid-margin stretch-card">
          <article :class="['card', 'asset-card', { inspected: ui.inspecting === asset.id, selected: ui.selected.has(asset.id) }]">
            <button type="button" class="asset-hit-target" :aria-label="`Inspect ${asset.name}`" @click="ui.inspecting = asset.id">
              <AssetThumbnail :asset="asset" :revision="data!.scannedAt" />
              <div class="card-body">
                <p class="asset-name"><i aria-hidden="true" :class="['mdi', typeIcons[asset.type]]" /><span :title="asset.name">{{ asset.name }}</span></p>
                <p class="asset-meta"><span>{{ asset.folder }}</span><span>{{ size(asset.size) }}</span></p>
                <div class="asset-footer"><StatusBadge :status="asset.status" /><small>{{ dimensions(asset) }}</small></div>
              </div>
            </button>
            <CheckBox class="asset-check" :checked="ui.selected.has(asset.id)" :label="`Select ${asset.name}`" @change="toggleSelected(asset.id)" />
            <button type="button" class="asset-menu" :aria-label="`Show details for ${asset.name}`" @click="ui.inspecting = asset.id"><i aria-hidden="true" class="mdi mdi-dots-horizontal" /></button>
          </article>
        </div>
      </div>
      <div v-else-if="filtered.length" class="card asset-list grid-margin">
        <div class="table-responsive">
          <table class="table table-hover mb-0">
            <thead>
              <tr><th class="check-column"><span class="sr-only">Select</span></th><th>Asset</th><th class="d-none d-md-table-cell">Folder</th><th>Status</th><th class="text-right">Size</th><th :class="inspected ? 'd-none' : 'd-none d-xl-table-cell'">Modified</th></tr>
            </thead>
            <tbody>
              <tr v-for="asset in filtered" :key="asset.id" :class="['asset-card', 'asset-row', { inspected: ui.inspecting === asset.id, selected: ui.selected.has(asset.id) }]">
                <td class="check-column"><CheckBox :checked="ui.selected.has(asset.id)" :label="`Select ${asset.name}`" @change="toggleSelected(asset.id)" /></td>
                <td>
                  <button type="button" class="asset-hit-target" :aria-label="`Inspect ${asset.name}`" @click="ui.inspecting = asset.id">
                    <AssetThumbnail :asset="asset" :revision="data!.scannedAt" /><span class="asset-name">{{ asset.name }}</span>
                  </button>
                </td>
                <td class="d-none d-md-table-cell text-muted">{{ asset.folder }}</td>
                <td><StatusBadge :status="asset.status" /></td>
                <td class="text-right text-nowrap">{{ size(asset.size) }}</td>
                <td :class="['text-nowrap text-muted', inspected ? 'd-none' : 'd-none d-xl-table-cell']">{{ time(asset.modifiedAt) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
      <div v-else class="card empty-state grid-margin">
        <div class="card-body">
          <i aria-hidden="true" :class="['mdi', caughtUp ? 'mdi-check-all text-success' : 'mdi-magnify text-muted']" />
          <h4>{{ caughtUp ? 'All caught up.' : 'No assets found' }}</h4>
          <p class="text-muted">{{ caughtUp ? 'Every asset is in sync with your GDA folder.' : 'Try a different search or clear your filters.' }}</p>
          <button type="button" class="btn btn-outline-primary" @click="showAll">Show all assets</button>
        </div>
      </div>
    </div>
    <div v-if="inspected" class="col-lg-5 col-xl-4 grid-margin"><AssetInspector :asset="inspected" /></div>
  </div>

  <div v-if="ui.selected.size" class="selection-spacer" />
  <div v-if="ui.selected.size" class="selection-bar card">
    <div class="card-body">
      <span class="font-weight-medium"><i aria-hidden="true" class="mdi mdi-checkbox-multiple-marked-outline text-primary" />{{ ui.selected.size }} assets selected</span>
      <button type="button" class="btn btn-link" @click="ui.selected = new Set()">Clear selection</button>
      <button type="button" class="btn btn-primary" :disabled="!!busy || !selectedPending.length" @click="requestSync(selectedPending.map(asset => asset.id))">
        <i aria-hidden="true" class="mdi mdi-sync" />Sync selected<span v-if="selectedPending.length" class="badge badge-light ml-2">{{ selectedPending.length }}</span>
      </button>
    </div>
  </div>
</template>
