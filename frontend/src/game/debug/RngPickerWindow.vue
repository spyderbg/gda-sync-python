<script setup lang="ts">
// AlphaFamilyMathRngTool's "RNG Picker" window (C++'s ImGuiDraw and RngTool::ImGuiDraw): a tab per round type; a reel
// round's screens (the tetra round's four, two a row) or a wheel's sectors; Tab Sync, and Add, which queues what the
// tab shows in the RNG Queue.
import { computed } from 'vue';
import type { AlphaFamilyMathRngTool } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/AlphaFamilyMathRngTool';
import type { SubscreenClick } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/RngToolReelRoundSubscreen';
import type { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import RngPickerSubscreen from './RngPickerSubscreen.vue';
import RssImage from './RssImage.vue';
import ToolPanel from './ToolPanel.vue';

const props = defineProps<{ module: AlphaFamilyMathRngTool; tick: number }>();
const emit = defineEmits<{ changed: [] }>();

// a frame of the window (ImGuiDraw runs every frame)
const view = computed(() => {
  void props.tick;
  return props.module.m_data?.Draw() ?? null;
});

function run(command: () => void) {
  command();
  emit('changed');
}

function click(subscreen: number, subscreenClick: SubscreenClick) {
  run(() => props.module.m_data?.Draw({ subscreen, click: subscreenClick }));
}

function selectTab(roundType: RoundType) {
  run(() => props.module.m_data?.SelectTab(roundType));
}

</script>

<template>
  <ToolPanel title="RNG Picker">
    <template v-if="view">
      <ul class="nav nav-tabs rng-picker-tabs" role="tablist">
        <li v-for="tab in view.tabs" :key="tab.roundType" class="nav-item" role="presentation">
          <button type="button" role="tab" :class="['nav-link', { active: tab.roundType === view.selected }]" :aria-selected="tab.roundType === view.selected" @click="selectTab(tab.roundType)">{{ tab.label }}</button>
        </li>
      </ul>

      <div v-if="view.reelRound" class="rng-picker-subscreens" :style="{ gridTemplateColumns: `repeat(${view.reelRound.columns}, auto)` }">
        <RngPickerSubscreen v-for="(subscreen, index) in view.reelRound.subscreens" :key="index" :module="module" :round-type="view.selected" :view="subscreen" :index="index"
          @click="subscreenClick => click(index, subscreenClick)" />
      </div>
      <div v-else-if="view.wheelRound" class="rng-picker-wheel">
        <RssImage v-if="view.wheelRound.image" :image="view.wheelRound.image" :height="100" :title="view.wheelRound.imageTitle" />
        <div role="radiogroup" :aria-label="`${view.tabs.find(tab => tab.roundType === view!.selected)?.label} sector`">
          <label v-for="sector in view.wheelRound.sectors" :key="sector.id" class="d-block mb-0">
            <input type="radio" name="rng-picker-sector" :checked="sector.id === view.wheelRound.pickedSectorId" @change="run(() => module.m_data?.PickWheelSector(sector.id))"> {{ sector.label }}
          </label>
        </div>
      </div>

      <div class="rng-picker-footer">
        <label class="mb-0"><input type="checkbox" :checked="view.tabSync" @change="run(() => module.m_data?.SetTabSync(($event.target as HTMLInputElement).checked))"> Tab Sync</label>
        <button type="button" class="btn btn-primary rng-picker-add" @click="run(() => module.m_data?.Add())">Add</button>
      </div>
    </template>
  </ToolPanel>
</template>

<style scoped lang="scss">
.rng-picker-tabs {
  margin-bottom: 0.5rem;

  .nav-link {
    padding: 0.2rem 0.6rem;
    border-top-left-radius: 3px;
    border-top-right-radius: 3px;
    background: none;
  }
}

.rng-picker-subscreens {
  display: grid;
  gap: 0.75rem 1.25rem;
}

.rng-picker-wheel {
  display: flex;
  gap: 1rem;
  align-items: flex-start;
}

.rng-picker-footer {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-top: 0.75rem;
}

// ImGui's 7 × 2 font sizes
.rng-picker-add {
  width: 7em;
  height: 2.4em;
}
</style>
