<script setup lang="ts">
defineProps<{ items: { label: string; color: string }[] }>();
</script>

<template>
  <div class="chartjs-legend">
    <ul><li v-for="item in items" :key="item.label"><span :style="{ backgroundColor: item.color }" />{{ item.label }}</li></ul>
  </div>
</template>
