<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="row page-title-header">
    <div class="col-12">
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
