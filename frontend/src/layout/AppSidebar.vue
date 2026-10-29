<script setup lang="ts">
import { computed } from 'vue';
import { ASSET_SECTIONS, number, sectionIcons, sectionNames } from '../format';
import type { AssetSection, View } from '../types';
import { activeSyncCount, assetCount, config, countSection, navigate, rssSync, ui } from '../workspace';

interface Entry { key: string; label: string; icon: string; count?: number; badge?: string; title?: string; active: boolean; onSelect: () => void }

// The library sections with an entry of their own: textures as Images and ImagesSeq (image sequences), then the other
// types. Models and materials have none: they are listed in the Asset library.
const ASSET_CATEGORIES: (AssetSection | 'all')[] = ['all', ...ASSET_SECTIONS];

const folders = (source: string, destination: string) => `GDA folder: ${source}\nGame folder: ${destination}`;

// The Sync badge counts what the summary of the latest GDA sync report has not in sync; there is none before the first report.
const notInSync = computed(() => {
  const summary = rssSync.value?.summary;
  return summary && { count: summary.different + summary.missing + summary.invalid, title: `${number(summary.different)} different, ${number(summary.missing)} missing, ${number(summary.invalid)} invalid` };
});

const syncEntries = computed<Entry[]>(() => [
  { key: 'pending', label: 'Sync', icon: 'mdi-sync', count: notInSync.value?.count, badge: 'badge-warning', title: notInSync.value?.title ?? 'No GDA sync report yet' },
  {
    key: 'rssSync', label: 'Sync in progress', icon: 'mdi-check-all', count: activeSyncCount.value || undefined, badge: 'badge-primary',
    title: activeSyncCount.value ? 'GDA sync in progress' : undefined,
  },
  { key: 'history', label: 'Sync history', icon: 'mdi-history' },
  { key: 'backups', label: 'Backups', icon: 'mdi-backup-restore' },
].map(entry => ({ ...entry, active: ui.view === entry.key, onSelect: () => navigate(entry.key as View) })));

const assetEntries = computed<Entry[]>(() => [...ASSET_CATEGORIES, ...(countSection('other') ? ['other' as const] : [])].map(category => ({
  key: category,
  label: category === 'all' ? 'Asset library' : sectionNames[category],
  icon: category === 'all' ? 'mdi-view-grid-outline' : sectionIcons[category],
  count: category === 'all' ? assetCount.value : countSection(category),
  badge: 'badge-light',
  active: ui.view === 'library' && ui.category === category,
  onSelect: () => navigate('library', category),
})));

// The browser game plays the workspace's game from its assets (frontend/src/game).
const gameEntries = computed<Entry[]>(() => [
  { key: 'game', label: 'Play', icon: 'mdi-slot-machine-outline', title: 'Play the game in the browser', active: ui.view === 'game', onSelect: () => navigate('game') },
  { key: 'imageStudio', label: 'Image studio', icon: 'mdi-image-edit-outline', title: 'Analyze images, edit metadata and generate artwork', active: ui.view === 'imageStudio', onSelect: () => navigate('imageStudio') },
]);

const sections = computed(() => [
  { key: 'assets', heading: 'Assets', title: undefined, entries: assetEntries.value },
  { key: 'game', heading: 'Game', title: undefined, entries: gameEntries.value },
  { key: 'sync', heading: 'Sync', title: folders(config.value.source, config.value.destination), entries: syncEntries.value },
]);
</script>

<template>
  <nav id="sidebar" :class="['sidebar', 'sidebar-offcanvas', { active: ui.sidebarOpen }]" aria-label="Main navigation">
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
  </nav>
</template>
