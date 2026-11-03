<script setup lang="ts">
defineProps<{ title: string; closable?: boolean }>();
defineEmits<{ close: [] }>();
</script>

<template>
  <section class="tool-panel card" role="region" :aria-label="title">
    <header class="tool-panel-title">
      <h2>{{ title }}</h2>
      <button v-if="closable" type="button" class="tool-panel-close" :aria-label="`Close ${title}`" title="Close" @click="$emit('close')"><i class="mdi mdi-close" aria-hidden="true" /></button>
    </header>
    <div class="tool-panel-body"><slot /></div>
  </section>
</template>

<style scoped lang="scss">
.tool-panel {
  min-width: 0;
  overflow: hidden;
  box-shadow: none;
}

.tool-panel-title {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #e3e7ef;
  background: #f8f9fc;
  color: #253045;

  h2 { margin: 0; font-size: 1rem; font-weight: 600; }
}

.tool-panel-close {
  padding: 0 0.25rem;
  border: 0;
  background: none;
  color: inherit;
  line-height: 1;
  cursor: pointer;
}

.tool-panel-body {
  padding: 1rem 1.25rem;
  overflow: auto;
  font-size: 0.85rem;
}
</style>
