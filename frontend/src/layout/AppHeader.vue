<script setup lang="ts">
import { computed } from 'vue';
import { config, navigate, ui } from '../workspace';
import WorkspaceIcon from '../components/WorkspaceIcon.vue';

// The dashboard and the global settings belong to no workspace, so they show no workspace's name, and their gear opens
// the global settings rather than the workspace's.
const global = computed(() => ui.view === 'dashboard' || ui.view === 'globalSettings');
const title = computed(() => ui.view === 'dashboard' ? 'Dashboard' : ui.view === 'globalSettings' ? 'Global settings' : config.value.name);
</script>

<template>
  <header class="app-header navbar default-layout col-lg-12 col-12 p-0 fixed-top d-flex flex-row">
    <div class="text-center navbar-brand-wrapper d-flex align-items-top justify-content-center">
      <a class="navbar-brand brand-logo" href="#" :aria-current="ui.view === 'dashboard' ? 'page' : undefined" @click.prevent="navigate('dashboard')">
        <img class="brand-mark" src="/app-icon.png" alt=""><span class="brand-text">EGT GDA Sync</span>
      </a>
      <a class="navbar-brand brand-logo-mini" href="#" aria-label="Toggle navigation" :aria-expanded="ui.sidebarOpen" aria-controls="sidebar" @click.prevent="ui.sidebarOpen = !ui.sidebarOpen">
        <img class="brand-mark" src="/app-icon.png" alt="">
      </a>
    </div>
    <div class="navbar-menu-wrapper d-flex align-items-center">
      <div class="navbar-heading">
        <a class="mobile-home" href="#" :aria-current="ui.view === 'dashboard' ? 'page' : undefined" @click.prevent="navigate('dashboard')">EGT GDA Sync</a>
        <span class="navbar-workspace-title">
          <WorkspaceIcon v-if="!global" :workspace-id="config.defaultWorkspace" :size="36" />
          <span class="navbar-game-title" :title="title">{{ title }}</span>
        </span>
      </div>
      <button v-if="global" type="button" :class="['header-settings', { active: ui.view === 'globalSettings' }]" aria-label="Global settings" title="Global settings" :aria-current="ui.view === 'globalSettings' ? 'page' : undefined" @click="navigate('globalSettings')">
        <i aria-hidden="true" class="mdi mdi-cog-outline" />
      </button>
      <button v-else type="button" :class="['header-settings', { active: ui.view === 'settings' }]" aria-label="Workspace settings" title="Workspace settings" :aria-current="ui.view === 'settings' ? 'page' : undefined" @click="navigate('settings')">
        <i aria-hidden="true" class="mdi mdi-cog-outline" />
      </button>
    </div>
  </header>
</template>

<style scoped>
.navbar-workspace-title { display: flex; align-items: center; gap: 10px; min-width: 0; }
</style>
