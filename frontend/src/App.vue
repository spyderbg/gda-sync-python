<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted } from 'vue';
import AppDialogs from './components/AppDialogs.vue';
import AppToast from './components/AppToast.vue';
import StartupState from './components/StartupState.vue';
import { useBackendLifetime } from './composables/useBackendLifetime';
import AppFooter from './layout/AppFooter.vue';
import AppHeader from './layout/AppHeader.vue';
import AppSidebar from './layout/AppSidebar.vue';
import DashboardView from './views/DashboardView.vue';
import LibraryView from './views/LibraryView.vue';
import SettingsView from './views/SettingsView.vue';
import SyncHistoryView from './views/SyncHistoryView.vue';
import SyncView from './views/SyncView.vue';
import { data, isLibraryView, load, loadError, stopped, ui } from './workspace';

useBackendLifetime(() => !stopped.value);

const loading = new AbortController();
onMounted(() => void load(loading.signal));

const visibleSearch = () => [...document.querySelectorAll<HTMLInputElement>('[data-asset-search]')].find(input => input.offsetParent !== null);

async function focusSearch() {
  if (!visibleSearch()) {
    if (!isLibraryView.value) ui.view = 'library';
    await nextTick();
  }
  visibleSearch()?.focus();
}

function onKeydown(event: KeyboardEvent) {
  const field = ['INPUT', 'TEXTAREA', 'SELECT'].includes((event.target as HTMLElement).tagName);
  if (((event.ctrlKey || event.metaKey) && event.key === 'k') || (event.key === '/' && !field)) {
    event.preventDefault();
    void focusSearch();
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown));
onBeforeUnmount(() => {
  loading.abort();
  window.removeEventListener('keydown', onKeydown);
});
</script>

<template>
  <StartupState v-if="stopped" kind="closed" />
  <StartupState v-else-if="loadError" kind="error" :message="loadError" />
  <StartupState v-else-if="!data" kind="loading" />
  <div v-else class="container-scroller">
    <AppHeader />
    <div class="container-fluid page-body-wrapper">
      <AppSidebar />
      <div class="main-panel">
        <div class="content-wrapper">
          <DashboardView v-if="ui.view === 'dashboard'" />
          <LibraryView v-else-if="isLibraryView" />
          <SyncView v-else-if="ui.view === 'rssSync'" />
          <SyncHistoryView v-else-if="ui.view === 'history'" />
          <SettingsView v-else-if="ui.view === 'settings'" />
        </div>
        <AppFooter />
      </div>
    </div>
    <AppToast />
    <AppDialogs />
  </div>
</template>
