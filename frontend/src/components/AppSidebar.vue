<script setup lang="ts">
import { ArrowUpRight, CheckCheck, ChevronDown, Clock3, LayoutGrid, RefreshCw, Settings2, ShieldCheck, Sparkles } from '@lucide/vue';
import { computed } from 'vue';
import { ASSET_TYPES, typeIcons, typeNames } from '../format';
import type { Asset, AssetType, View, WorkspaceConfig } from '../types';

const props = defineProps<{
  config: WorkspaceConfig; assets: Asset[]; view: View; category: AssetType | 'all'; version: string; platform: string;
}>();
const emit = defineEmits<{ navigate: [view: View, category?: AssetType] }>();
const pending = computed(() => props.assets.filter(asset => asset.status !== 'synced').length);
const countOf = (type: AssetType) => props.assets.filter(asset => asset.type === type).length;
</script>

<template>
  <aside class="sidebar">
    <a class="brand" href="#" @click.prevent="emit('navigate', 'library')"><span class="brand-mark"><RefreshCw :size="24" :strokeWidth="2" /></span><span>GDA<span class="brand-light"> Sync</span></span></a>
    <div class="workspace-label">WORKSPACE</div>
    <button class="workspace-switch" @click="emit('navigate', 'settings')">
      <span class="workspace-avatar"><Sparkles :size="17" /></span>
      <span><strong>{{ config.name }}</strong><small>{{ config.demo ? 'Environment demo' : 'Asset workspace' }}</small></span>
      <ChevronDown :size="14" />
    </button>
    <nav aria-label="Main navigation" class="main-nav">
      <button aria-label="Asset library" :class="{ active: view === 'library' && category === 'all' }" @click="emit('navigate', 'library')"><LayoutGrid :size="18" /><span>Asset library</span><b>{{ assets.length }}</b></button>
      <button aria-label="Needs sync" :class="{ active: view === 'pending' }" @click="emit('navigate', 'pending')"><RefreshCw :size="18" /><span>Needs sync</span><b class="pending-count">{{ pending }}</b></button>
      <button aria-label="In sync" :class="{ active: view === 'synced' }" @click="emit('navigate', 'synced')"><CheckCheck :size="18" /><span>In sync</span><b>{{ assets.length - pending }}</b></button>
      <button aria-label="Sync activity" :class="{ active: view === 'activity' }" @click="emit('navigate', 'activity')"><Clock3 :size="18" /><span>Sync activity</span></button>
    </nav>
    <div class="sidebar-divider" />
    <div class="workspace-label">ASSET TYPES</div>
    <nav aria-label="Asset types" class="type-nav">
      <button v-for="type in ASSET_TYPES" :key="type" :aria-label="typeNames[type]" :class="{ active: category === type && view === 'library' }" @click="emit('navigate', 'library', type)">
        <component :is="typeIcons[type]" :size="17" /><span>{{ typeNames[type] }}</span><small>{{ countOf(type) }}</small>
      </button>
    </nav>
    <div class="sidebar-bottom">
      <div class="local-note"><ShieldCheck :size="21" /><strong>At home on your machine.</strong><p>Your files stay local.<br>Your workflow stays yours.</p><span>NO CLOUD REQUIRED <ArrowUpRight :size="12" /></span></div>
      <button aria-label="Workspace settings" :class="['settings-nav', { active: view === 'settings' }]" @click="emit('navigate', 'settings')"><Settings2 :size="18" />Workspace settings</button>
      <div class="sidebar-profile">
        <div class="profile-avatar">VS</div>
        <div><strong>Studio workspace</strong><span><i />{{ platform }} · local</span></div>
        <span class="version">v{{ version }}</span>
      </div>
    </div>
  </aside>
</template>
