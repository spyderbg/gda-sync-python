<script setup lang="ts">
defineProps<{ title: string }>();
</script>

<template>
  <div class="row page-title-header">
    <div class="col-12">
      <div class="page-header" :class="{ 'page-header-with-actions': $slots.actions }">
        <h4 class="page-title">{{ title }}</h4>
        <div class="quick-link-wrapper w-100 d-md-flex flex-md-wrap">
          <ul class="quick-links"><slot name="links" /></ul>
          <ul class="quick-links ml-auto"><slot name="links-right" /></ul>
        </div>
        <div v-if="$slots.actions" class="page-header-actions"><slot name="actions" /></div>
      </div>
    </div>
    <div v-if="$slots.toolbar" class="col-md-12">
      <div class="page-header-toolbar"><slot name="toolbar" /></div>
    </div>
  </div>
</template>

<style scoped>
.page-header-with-actions { display: grid; grid-template-columns: max-content minmax(0, 1fr) auto; align-items: center; gap: 8px 16px; }
.page-header-with-actions .page-title { grid-area: 1 / 1; margin: 0; }
.page-header-actions { grid-area: 1 / -2; justify-self: end; }
@media (max-width: 767px) {
  .page-header-with-actions { grid-template-columns: minmax(0, 1fr) auto; }
  .page-header-with-actions .quick-link-wrapper { grid-area: 2 / 1 / auto / -1; }
}
</style>
