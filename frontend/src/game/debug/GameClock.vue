<script setup lang="ts">
// The Automation window's Game Clock (AutomationManager, C++'s ImGuiDraw): Pause / Resume, and the clock's speed. The
// Play page's panel shows only its speed slider (`sliderOnly`), with a button that resets the speed to 1.
import { computed } from 'vue';
import type { AutomationManager } from '@game/integration/AutomationManager/AutomationManager';

const props = defineProps<{ manager: AutomationManager; tick: number; sliderOnly?: boolean }>();
const emit = defineEmits<{ changed: [] }>();

const SPEEDS: [string, number][] = [['1/60', 1 / 60], ['100%', 1], ['200%', 2], ['400%', 4], ['1000%', 10]];

const state = computed(() => {
  void props.tick;
  return { pause: props.manager.GetPauseControl(), speed: props.manager.GetClockSpeed() };
});

function run(command: () => void) {
  command();
  emit('changed');
}
</script>

<template>
  <div :class="['game-clock', { 'game-clock-slider-only': sliderOnly }]" role="group" aria-label="Game clock">
    <div v-if="!sliderOnly" class="game-clock-row">
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.pause" @click="run(() => manager.TogglePause())">{{ state.pause?.held ? 'Resume' : 'Pause' }}</button>
      <button v-for="[label, speed] in SPEEDS" :key="label" type="button" class="btn btn-outline-secondary btn-sm" @click="run(() => manager.SetClockSpeed(speed))">{{ label }}</button>
    </div>
    <!-- out of the label: a button in it would be the label's control, and clicking the speed would reset it -->
    <button v-if="sliderOnly" type="button" class="btn btn-outline-secondary btn-sm game-clock-reset" :disabled="state.speed === 1"
      title="Reset the speed to 1.00" aria-label="Reset the speed to 1.00" @click="run(() => manager.SetClockSpeed(1))">
      <i class="mdi mdi-close" aria-hidden="true" />
    </button>
    <label class="game-clock-row mb-0" :title="sliderOnly ? 'The game clock\'s speed (the Automation window\'s Game Clock)' : undefined">
      <input type="range" min="0" max="4" step="0.01" :value="state.speed" aria-label="Speed" @input="run(() => manager.SetClockSpeed(Number(($event.target as HTMLInputElement).value)))">
      <span class="game-clock-speed">{{ state.speed.toFixed(3) }} Speed</span>
    </label>
  </div>
</template>

<style scoped lang="scss">
.game-clock-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}

.game-clock-slider-only {
  display: flex;
  align-items: center;
  gap: 0.5rem;

  .game-clock-row {
    gap: 0.5rem;
    margin-bottom: 0;
  }

  input {
    width: 10rem;
  }

  // the speed's width stays put as it changes, so the slider does not move
  .game-clock-speed {
    min-width: 6.5em;
    font-variant-numeric: tabular-nums;
  }
}
</style>
