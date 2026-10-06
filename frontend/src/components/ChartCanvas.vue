<script setup lang="ts">
import type { ChartConfiguration, ChartType } from 'chart.js';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { Chart } from '../charts/chartjs';

const props = defineProps<{ config: ChartConfiguration<ChartType>; label: string; height: number; width?: number }>();
const canvas = ref<HTMLCanvasElement>();
let chart: Chart | undefined;

onMounted(() => { chart = new Chart(canvas.value!, props.config); });
watch(() => props.config, config => {
  if (!chart) return;
  chart.data = config.data;
  chart.options = config.options ?? {};
  chart.update();
});
onBeforeUnmount(() => chart?.destroy());
</script>

<template>
  <div class="chart-container" :style="{ height: `${height}px`, width: width ? `${width}px` : undefined }">
    <canvas ref="canvas" role="img" :aria-label="label" />
  </div>
</template>
