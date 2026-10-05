<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { ASSET_TYPES, number, typeIcons, typeNames } from '../format';
import type { AssetType, View } from '../types';
import { assets, busy, config, countStatus, countType, navigate, pending, selectWorkspace, syncedCount, ui, workspaces } from '../workspace';

interface Entry { key: string; label: string; icon: string; count?: number; badge?: string; title?: string; active: boolean; onSelect: () => void }

// Choosing a workspace on the dashboard opens the first step of its work.
const LANDING_VIEW: View = 'pending';
const MAX_UNFILTERED = 8;
const ASSET_CATEGORIES: (AssetType | 'all')[] = ['all', ...ASSET_TYPES];

// A workspace is selected only while one of its views is open; the dashboard covers all of them.
const inWorkspace = computed(() => ui.view !== 'dashboard');
const activeId = computed(() => config.value.defaultWorkspace || 'current');
const selectedId = computed(() => inWorkspace.value ? activeId.value : null);
const games = computed(() => workspaces.value.length ? workspaces.value : [{ id: 'current', name: config.value.name, source: config.value.source, destination: config.value.destination }]);
const folders = (source: string, destination: string) => `Game folder: ${source}\nGDA folder: ${destination}`;

const filter = ref('');
const filterable = computed(() => games.value.length > MAX_UNFILTERED);
const shownGames = computed(() => {
  const needle = filter.value.trim().toLowerCase();
  if (!filterable.value || !needle) return games.value;
  return games.value.filter(game => game.name.toLowerCase().includes(needle) || game.id.toLowerCase().includes(needle));
});

const gameList = ref<HTMLElement | null>(null);
function revealSelected() {
  const list = gameList.value;
  const item = list?.querySelector<HTMLElement>('[aria-current="true"]');
  if (!list || !item) return;
  if (item.offsetTop < list.scrollTop) list.scrollTop = item.offsetTop;
  else if (item.offsetTop + item.offsetHeight > list.scrollTop + list.clientHeight) list.scrollTop = item.offsetTop + item.offsetHeight - list.clientHeight;
}
watch([selectedId, shownGames], revealSelected, { flush: 'post' });
onMounted(revealSelected);

async function chooseWorkspace(id: string) {
  if (busy.value || id === selectedId.value) return;
  const { view, category } = ui;
  const target = view === 'dashboard' ? LANDING_VIEW : view;
  // selectWorkspace ignores the workspace that is already active, so open its view directly.
  if (id === activeId.value) return navigate(target);
  await selectWorkspace(id);
  // selectWorkspace always ends on the dashboard; return to where the user was unless the switch failed.
  if (config.value.defaultWorkspace !== id) return;
  navigate(target, target === 'library' && category !== 'all' && countType(category) ? category : 'all');
}

const syncEntries = computed<Entry[]>(() => [
  { key: 'pending', label: 'Needs sync', icon: 'mdi-sync', count: pending.value.length, badge: 'badge-warning', title: `${number(countStatus('new'))} new, ${number(countStatus('modified'))} modified` },
  { key: 'synced', label: 'In sync', icon: 'mdi-check-all', count: syncedCount.value, badge: 'badge-success' },
  { key: 'activity', label: 'Sync activity', icon: 'mdi-history' },
].map(entry => ({ ...entry, active: ui.view === entry.key, onSelect: () => navigate(entry.key as View) })));

const assetEntries = computed<Entry[]>(() => [...ASSET_CATEGORIES, ...(countType('other') ? ['other' as const] : [])].map(category => ({
  key: category,
  label: category === 'all' ? 'Asset library' : typeNames[category],
  icon: category === 'all' ? 'mdi-view-grid-outline' : typeIcons[category],
  count: category === 'all' ? assets.value.length : countType(category),
  badge: 'badge-light',
  active: ui.view === 'library' && ui.category === category,
  onSelect: () => navigate('library', category),
})));

const sections = computed(() => [
  { key: 'sync', heading: 'Sync', title: folders(config.value.source, config.value.destination), entries: syncEntries.value },
  { key: 'assets', heading: 'Assets', title: undefined, entries: assetEntries.value },
]);
</script>

<template>
  <nav id="sidebar" :class="['sidebar', 'sidebar-offcanvas', { active: ui.sidebarOpen }]" aria-label="Main navigation">
    <h2 id="sidebar-workspaces-heading" class="sidebar-section-label">Workspaces</h2>
    <input v-if="filterable" v-model="filter" type="search" class="workspace-filter" placeholder="Filter workspaces" aria-label="Filter workspaces" aria-controls="sidebar-workspaces">
    <ul id="sidebar-workspaces" ref="gameList" class="nav workspace-game-list" aria-labelledby="sidebar-workspaces-heading">
      <li v-for="game in shownGames" :key="game.id" :class="['nav-item', { active: game.id === selectedId }]">
        <button type="button" :class="['nav-link', 'workspace-game', { active: game.id === selectedId }]" :aria-current="game.id === selectedId ? 'true' : undefined" :title="`ID: ${game.id}\n${folders(game.source, game.destination)}`" :disabled="!!busy" @click="chooseWorkspace(game.id)">
          <span class="menu-title">{{ game.name }}</span>
        </button>
      </li>
    </ul>
    <p v-if="!shownGames.length" class="workspace-empty">No matching workspace</p>
    <template v-if="inWorkspace">
      <template v-for="section in sections" :key="section.key">
        <h2 :id="`sidebar-${section.key}-heading`" class="sidebar-section-label" :title="section.title">
          {{ section.heading }}
        </h2>
        <ul class="nav" :aria-labelledby="`sidebar-${section.key}-heading`">
          <li v-for="entry in section.entries" :key="entry.key" :class="['nav-item', { active: entry.active }]">
            <button type="button" class="nav-link" :aria-label="entry.label" :aria-current="entry.active ? 'page' : undefined" :title="entry.title" @click="entry.onSelect">
              <i aria-hidden="true" :class="['menu-icon', 'mdi', entry.icon]" /><span class="menu-title">{{ entry.label }}</span>
              <span v-if="entry.count !== undefined" :class="['badge', 'badge-pill', entry.badge]">{{ number(entry.count) }}</span>
            </button>
          </li>
        </ul>
      </template>
    </template>
  </nav>
</template>
