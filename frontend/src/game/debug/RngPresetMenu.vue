<script setup lang="ts">
// A node of the RNG Presets' menus (C++'s RngPresets::ImguiDrawPresetMenu): a submenu (ImGui::BeginMenu) that opens
// to its children, or a preset (ImGui::MenuItem) that queues its RNG numbers, with its preview as its tooltip.
import { ref } from 'vue';
import type { IRngGridPreviewPtr } from '@game/integration/Runtime/IRngQueueGridPreview';
import { RngPresets } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngPreset/RngPresets';
import type { RngPresetsData } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngPreset/RngPresets.data';
import RngGridPreview from './RngGridPreview.vue';

const props = defineProps<{ presets: RngPresets; node: RngPresetsData; parentPath: string[] }>();
const emit = defineEmits<{ changed: [] }>();

defineOptions({ name: 'RngPresetMenu' });

const open = ref(false);
const tooltip = ref<{ previews: IRngGridPreviewPtr[]; x: number; y: number } | null>(null);
const applied = ref<boolean | null>(null);

function apply() {
  applied.value = props.presets.ApplyMenuItem(props.node, props.parentPath);
  window.setTimeout(() => (applied.value = null), 800);
  emit('changed');
}

function showTooltip(event: MouseEvent) {
  const previews = props.presets.GetPresetLeafTooltipPreviews(props.node);
  tooltip.value = previews.length ? { previews, x: event.clientX + 14, y: event.clientY + 14 } : null;
}
</script>

<template>
  <div v-if="RngPresets.IsSubmenu(node)" class="rng-preset-menu">
    <button type="button" class="rng-preset-item" :aria-expanded="open" @click="open = !open">
      <span>{{ node.name }}</span><i :class="['mdi', open ? 'mdi-chevron-down' : 'mdi-chevron-right']" aria-hidden="true" />
    </button>
    <div v-if="open" class="rng-preset-children" role="group" :aria-label="node.name">
      <RngPresetMenu v-for="(child, index) in node.children" :key="index" :presets="presets" :node="child" :parent-path="RngPresets.GetMenuPath(parentPath, node)" @changed="emit('changed')" />
    </div>
  </div>
  <button v-else type="button" :class="['rng-preset-item', { 'rng-preset-applied': applied === true, 'rng-preset-refused': applied === false }]"
    @click="apply" @mousemove="showTooltip" @mouseleave="tooltip = null">
    <span>{{ RngPresets.GetMenuLabel(node) }}</span>
    <i v-if="applied === true" class="mdi mdi-check" aria-label="Queued" />
    <i v-else-if="applied === false" class="mdi mdi-close" aria-label="Nothing to queue" />
  </button>
  <div v-if="tooltip" class="rng-preset-tooltip card shadow-sm" :style="{ left: `${tooltip.x}px`, top: `${tooltip.y}px` }">
    <template v-for="(preview, index) in tooltip.previews" :key="index">
      <hr v-if="index > 0" class="my-1">
      <RngGridPreview :preview="preview" />
    </template>
  </div>
</template>

<style scoped lang="scss">
.rng-preset-item {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.15rem 0.4rem;
  border: 0;
  border-radius: 3px;
  background: none;
  text-align: left;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    background: #e9ecef;
  }
}

.rng-preset-applied {
  background: #d4edda;
}

.rng-preset-refused {
  background: #f8d7da;
}

.rng-preset-children {
  padding-left: 0.75rem;
  border-left: 1px solid #dee2e6;
  margin-left: 0.4rem;
}

.rng-preset-tooltip {
  position: fixed;
  z-index: 1060;
  padding: 0.35rem 0.5rem;
  pointer-events: none;
}
</style>
