<script setup lang="ts">
import { computed } from 'vue';
import { config, navigate, ui } from '../workspace';

const title = computed(() => ui.view === 'dashboard' ? 'Dashboard' : config.value.name);
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
      <span class="navbar-game-title" :title="title">{{ title }}</span>
      <!-- Settings belong to one workspace, so the dashboard does not offer them. -->
      <button v-if="ui.view !== 'dashboard'" type="button" :class="['header-settings', { active: ui.view === 'settings' }]" aria-label="Workspace settings" title="Workspace settings" :aria-current="ui.view === 'settings' ? 'page' : undefined" @click="navigate('settings')">
        <i aria-hidden="true" class="mdi mdi-cog-outline" />
      </button>
    </div>
  </header>
</template>
