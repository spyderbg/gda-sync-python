<script setup lang="ts">
import { computed } from 'vue';
import { config, ui } from '../workspace';

const title = computed(() => ui.view === 'dashboard' ? 'Dashboard' : config.value.name);
</script>

<template>
  <nav class="navbar default-layout col-lg-12 col-12 p-0 fixed-top d-flex flex-row">
    <div class="text-center navbar-brand-wrapper d-flex align-items-top justify-content-center">
      <div class="navbar-brand brand-logo">
        <img class="brand-mark" src="/app-icon.png" alt=""><span class="brand-text">EGT GDA Sync</span>
      </div>
      <a class="navbar-brand brand-logo-mini" href="#" aria-label="Toggle navigation" :aria-expanded="ui.sidebarOpen" aria-controls="sidebar" @click.prevent="ui.sidebarOpen = !ui.sidebarOpen">
        <img class="brand-mark" src="/app-icon.png" alt="">
      </a>
    </div>
    <div class="navbar-menu-wrapper d-flex align-items-center">
      <span class="navbar-game-title" :title="title">{{ title }}</span>
    </div>
  </nav>
</template>
