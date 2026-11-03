<script setup lang="ts">
import { computed } from 'vue';
import type { GameApp } from '@game/app/GameApp';
import { RngPresetManager } from '@game/integration/RngPresetManager/RngPresetManager';
import { AutomationManager } from '@game/integration/AutomationManager/AutomationManager';
import { AlphaFamilyMathRngTool } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/AlphaFamilyMathRngTool';
import { AlphaFamilyMathRngPreset } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngPreset/AlphaFamilyMathRngPreset';
import RngQueueWindow from './debug/RngQueueWindow.vue';
import RngQueueUnlockWindow from './debug/RngQueueUnlockWindow.vue';
import RngPresetWindow from './debug/RngPresetWindow.vue';
import RngPickerWindow from './debug/RngPickerWindow.vue';
import AutomationWindow from './debug/AutomationWindow.vue';

const props = defineProps<{ app: GameApp; tick: number }>();
const emit = defineEmits<{ changed: [] }>();

const tools = computed(() => {
  void props.tick;
  const queue = props.app.Get(RngPresetManager);
  const automation = props.app.Get(AutomationManager);
  return {
    queue,
    hidden: queue?.AreMathDetailsHidden() ?? false,
    picker: props.app.Get(AlphaFamilyMathRngTool),
    preset: props.app.Get(AlphaFamilyMathRngPreset),
    automation,
    automationOpen: automation?.m_imguiWindowOpen.value ?? false,
  };
});

function toggleAutomation() {
  if (!tools.value.automation) return;
  tools.value.automation.m_imguiWindowOpen.value = !tools.value.automationOpen;
  emit('changed');
}
</script>

<template>
  <section class="game-tools-panel" aria-label="Game tools">
    <div class="game-tools-toolbar">
      <p class="text-muted mb-0">Manage the RNG queue, choose presets, or configure a round. The game keeps running when you switch pages.</p>
      <button v-if="tools.automation" type="button" class="btn btn-outline-primary" :aria-expanded="tools.automationOpen" aria-controls="game-tools-automation" @click="toggleAutomation">
        <i class="mdi mdi-robot-outline" aria-hidden="true" /> {{ tools.automationOpen ? 'Hide Automation' : 'Open Automation' }}
      </button>
    </div>
    <div class="game-tools-grid">
      <template v-if="!tools.hidden">
        <RngPickerWindow v-if="tools.picker" class="game-tools-wide" :module="tools.picker" :tick="tick" @changed="emit('changed')" />
        <RngQueueWindow v-if="tools.queue" :manager="tools.queue" :tick="tick" @changed="emit('changed')" />
        <RngPresetWindow v-if="tools.preset" :module="tools.preset" :tick="tick" @changed="emit('changed')" />
      </template>
      <RngQueueUnlockWindow v-else-if="tools.queue" class="game-tools-wide" :manager="tools.queue" :tick="tick" @changed="emit('changed')" />
      <AutomationWindow v-if="tools.automation && tools.automationOpen" id="game-tools-automation" class="game-tools-wide" :manager="tools.automation" :tick="tick" @changed="emit('changed')" />
    </div>
    <p v-if="!tools.queue && !tools.preset && !tools.picker && !tools.automation" class="text-muted">This game has no tools available.</p>
  </section>
</template>

<style scoped lang="scss">
.game-tools-toolbar {
  display: flex;
  flex-wrap: wrap;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  margin-bottom: 1.25rem;

  p { flex: 1 1 28rem; }
  button { flex: 0 0 auto; }
}

.game-tools-grid {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(16rem, 1fr);
  align-items: start;
  gap: 1.25rem;
}

.game-tools-wide { grid-column: 1 / -1; }

@media (max-width: 1100px) {
  .game-tools-grid { grid-template-columns: minmax(0, 1fr); }
}
</style>
