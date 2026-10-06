<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import { previewURL, typeIcons } from '../format';
import type { Asset } from '../types';

const props = defineProps<{ asset: Asset; revision: string; large?: boolean }>();
const failed = ref(false);
// A new scan or file version gets another chance to load its preview.
watch(() => [props.asset.id, props.asset.modifiedAt, props.revision], () => { failed.value = false; });

const classes = computed(() => ['thumbnail', props.asset.type, {
  large: props.large, dds: props.asset.extension === 'dds', 'normal-map': props.asset.name.includes('normal'),
}]);
const bars = Array.from({ length: 30 }, (_, i) => `${8 + Math.abs(Math.sin(i * 1.7)) * 37}px`);
</script>

<template>
  <div :class="classes">
    <img v-if="asset.preview && !failed" :src="previewURL(asset, revision)" :alt="`${asset.name} preview`" loading="lazy" @error="failed = true">
    <div v-else :class="['generic-preview', asset.type]">
      <i aria-hidden="true" :class="['mdi', typeIcons[asset.type]]" />
      <div v-if="asset.type === 'audio'" class="waveform"><i aria-hidden="true" v-for="(height, i) in bars" :key="i" :style="{ height }" /></div>
    </div>
    <span v-if="!large" class="badge file-format">{{ asset.extension.toUpperCase() }}</span>
    <span v-if="large && asset.type === 'model'" class="illustration-label">Demo illustration</span>
    <span v-if="large && (!asset.preview || failed)" class="illustration-label">{{ asset.previewError || 'No image preview available' }}</span>
  </div>
</template>
