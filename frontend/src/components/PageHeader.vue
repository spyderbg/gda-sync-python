<script setup lang="ts">
import { navigate, ui } from '../workspace';

defineProps<{ title: string }>();
</script>

<template>
  <div class="row page-title-header">
    <div class="col-12">
      <a href="#" class="page-dashboard-link" :aria-current="ui.view === 'dashboard' ? 'page' : undefined" @click.prevent="navigate('dashboard')"><i aria-hidden="true" class="mdi mdi-view-dashboard-outline" />Dashboard</a>
      <div class="page-header">
        <h4 class="page-title">{{ title }}</h4>
        <div class="quick-link-wrapper w-100 d-md-flex flex-md-wrap">
          <ul class="quick-links"><slot name="links" /></ul>
          <ul class="quick-links ml-auto"><slot name="links-right" /></ul>
        </div>
      </div>
    </div>
    <div v-if="$slots.toolbar" class="col-md-12">
      <div class="page-header-toolbar"><slot name="toolbar" /></div>
    </div>
  </div>
</template>
