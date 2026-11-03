<script setup lang="ts">
// AlphaFamilyMathRngPreset's "RNG Preset" window (C++'s RngPresets::ImGuiDraw): the game's presets as menus; a preset
// queues its RNG numbers in the RNG Queue, and its tooltip previews what they show.
import { computed } from 'vue';
import type { AlphaFamilyMathRngPreset } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngPreset/AlphaFamilyMathRngPreset';
import RngPresetMenu from './RngPresetMenu.vue';
import ToolPanel from './ToolPanel.vue';

const props = defineProps<{ module: AlphaFamilyMathRngPreset; tick: number }>();
const emit = defineEmits<{ changed: [] }>();

const roots = computed(() => {
  void props.tick;
  return props.module.m_data?.GetMenuRoots() ?? [];
});

</script>

<template>
  <ToolPanel title="RNG Preset">
    <nav aria-label="RNG presets">
      <RngPresetMenu v-for="(node, index) in roots" :key="index" :presets="module.m_data!" :node="node" :parent-path="[]" @changed="emit('changed')" />
    </nav>
    <p v-if="!roots.length" class="text-muted mb-0">The game has no RNG presets (DevMathRngPresetConfig).</p>
  </ToolPanel>
</template>
