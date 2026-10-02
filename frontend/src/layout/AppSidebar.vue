<script setup lang="ts">
import { computed, ref } from 'vue';
import { ASSET_TYPES, typeNames } from '../format';
import type { AssetType, View } from '../types';
import { assets, config, countType, navigate, pending, syncedCount, ui } from '../workspace';

const typesOpen = ref(false);
const initials = computed(() => config.value.name.split(/\s+/).map(word => word[0]).join('').slice(0, 2).toUpperCase());
const items: { view: View; title: string; icon: string }[] = [
  { view: 'dashboard', title: 'Dashboard', icon: 'mdi-view-dashboard-outline' },
  { view: 'library', title: 'Asset library', icon: 'mdi-view-grid-outline' },
  { view: 'pending', title: 'Needs sync', icon: 'mdi-sync' },
  { view: 'synced', title: 'In sync', icon: 'mdi-check-all' },
  { view: 'activity', title: 'Sync activity', icon: 'mdi-history' },
];
const counts = computed<Partial<Record<View, { value: number; badge: string }>>>(() => ({
  library: { value: assets.value.length, badge: 'badge-light' },
  pending: { value: pending.value.length, badge: 'badge-warning' },
  synced: { value: syncedCount.value, badge: 'badge-success' },
}));
const active = (view: View) => ui.view === view && (view !== 'library' || ui.category === 'all');
const showType = (type: AssetType) => navigate('library', type);
</script>

<template>
  <nav id="sidebar" :class="['sidebar', 'sidebar-offcanvas', { active: ui.sidebarOpen }]" aria-label="Main navigation">
    <ul class="nav">
      <li class="nav-item nav-profile">
        <a href="#" class="nav-link" @click.prevent="navigate('settings')">
          <div class="profile-image">
            <span class="img-xs rounded-circle text-avatar bg-white text-primary">{{ initials }}</span>
            <div class="dot-indicator bg-success" />
          </div>
          <div class="text-wrapper">
            <p class="profile-name">{{ config.name }}</p>
            <p class="designation">{{ config.demo ? 'Environment demo' : 'Asset workspace' }}</p>
          </div>
        </a>
      </li>
      <li class="nav-item nav-category">Main Menu</li>
      <li v-for="item in items" :key="item.view" :class="['nav-item', { active: active(item.view) }]">
        <button type="button" class="nav-link" :aria-label="item.title" @click="navigate(item.view)">
          <i aria-hidden="true" :class="['menu-icon', 'mdi', item.icon]" /><span class="menu-title">{{ item.title }}</span>
          <span v-if="counts[item.view]" :class="['badge', 'badge-pill', counts[item.view]!.badge]">{{ counts[item.view]!.value }}</span>
        </button>
      </li>
      <li :class="['nav-item', { active: ui.view === 'library' && ui.category !== 'all' }]">
        <button type="button" class="nav-link" :aria-expanded="typesOpen" aria-controls="asset-types" @click="typesOpen = !typesOpen">
          <i aria-hidden="true" class="menu-icon mdi mdi-shape-outline" /><span class="menu-title">Asset types</span><i aria-hidden="true" class="menu-arrow" />
        </button>
        <div id="asset-types" :class="['collapse', { show: typesOpen }]">
          <ul class="nav flex-column sub-menu">
            <li v-for="type in ASSET_TYPES" :key="type" class="nav-item">
              <button type="button" :class="['nav-link', { active: ui.view === 'library' && ui.category === type }]" :aria-label="typeNames[type]" @click="showType(type)">
                {{ typeNames[type] }}<span class="sub-count">{{ countType(type) }}</span>
              </button>
            </li>
          </ul>
        </div>
      </li>
      <li :class="['nav-item', { active: ui.view === 'settings' }]">
        <button type="button" class="nav-link" aria-label="Workspace settings" @click="navigate('settings')">
          <i aria-hidden="true" class="menu-icon mdi mdi-cog-outline" /><span class="menu-title">Workspace settings</span>
        </button>
      </li>
    </ul>
  </nav>
</template>
