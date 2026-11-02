<script setup lang="ts">
// AutomationManager's "Automation" window (C++'s ImGuiDraw): the game clock (pause, speed); the automation playing (Stop,
// its view mode and strategy); the games recorded (Clear, Import and Export as CSV, and the Truserv XMLs); replaying a
// recorded game or all; generating games, seeded or not. An import reads a file you pick; an export downloads a file.
import { computed, ref } from 'vue';
import { AutomationMode } from '@game/integration/Runtime/IAutomationManager';
import {
  type AutomationManager, MaxGenerateCount, SeedMode, SeedModeLabels, StrategyLabels, ViewModeLabels,
} from '@game/integration/AutomationManager/AutomationManager';
import ToolWindow from './ToolWindow.vue';

const props = defineProps<{ manager: AutomationManager; tick: number }>();
const emit = defineEmits<{ changed: [] }>();

const SPEEDS: [string, number][] = [['1/60', 1 / 60], ['100%', 1], ['200%', 2], ['400%', 4], ['1000%', 10]];

const state = computed(() => {
  void props.tick;
  const m = props.manager;
  const gamesCount = m.GetGamesCount();
  return {
    pause: m.GetPauseControl(),
    speed: m.GetClockSpeed(),
    mode: m.m_mode,
    running: m.m_mode !== AutomationMode.Disabled,
    gameInProgress: m.m_gameInProgress !== null,
    gamesCount,
    viewMode: m.m_viewMode,
    strategy: m.m_strategyMode,
    replayGame: gamesCount ? Math.min(Math.max(m.m_replayGame, 1), gamesCount) : m.m_replayGame,
    seedMode: m.m_generateSeedMode,
    seed: m.m_generateSeed,
    count: m.m_generateCount,
  };
});
const importInput = ref<HTMLInputElement | null>(null);

function run(command: () => void) {
  command();
  emit('changed');
}

function download(name: string, text: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  URL.revokeObjectURL(url);
}

async function importGames(event: Event) {
  const file = (event.target as HTMLInputElement).files?.[0];
  if (!file) return;
  const text = await file.text();
  run(() => props.manager.ImportGames(text));
  (event.target as HTMLInputElement).value = '';
}

function number(event: Event) {
  return Number((event.target as HTMLInputElement).value);
}

function close() {
  props.manager.m_imguiWindowOpen.value = false;
  emit('changed');
}
</script>

<template>
  <ToolWindow title="Automation" :width="420" :offset="4" @close="close">
    <div class="automation-section">Game Clock</div>
    <div class="automation-row">
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.pause" @click="run(() => manager.TogglePause())">{{ state.pause?.held ? 'Resume' : 'Pause' }}</button>
      <button v-for="[label, speed] in SPEEDS" :key="label" type="button" class="btn btn-outline-secondary btn-sm" @click="run(() => manager.SetClockSpeed(speed))">{{ label }}</button>
    </div>
    <label class="automation-row mb-0">
      <input type="range" min="0" max="4" step="0.01" :value="state.speed" aria-label="Speed" @input="run(() => manager.SetClockSpeed(number($event)))">
      <span>{{ state.speed.toFixed(3) }} Speed</span>
    </label>

    <div class="automation-section">Auto Play</div>
    <div class="automation-row">
      <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.running" @click="run(() => manager.StopAutomation(false))">Stop</button>
      <span :class="{ 'automation-running': state.running }">Automation: {{ AutomationMode[state.mode] }}</span>
    </div>
    <fieldset :disabled="state.running">
      <label class="automation-field">
        <select class="custom-select custom-select-sm" :value="state.viewMode" @change="run(() => (manager.m_viewMode = Number(($event.target as HTMLSelectElement).value)))">
          <option v-for="(label, index) in ViewModeLabels" :key="index" :value="index">{{ label }}</option>
        </select>
        <span>View Mode</span>
      </label>
      <label class="automation-field">
        <select class="custom-select custom-select-sm" :value="state.strategy" @change="run(() => (manager.m_strategyMode = Number(($event.target as HTMLSelectElement).value)))">
          <option v-for="(label, index) in StrategyLabels" :key="index" :value="index">{{ label }}</option>
        </select>
        <span>Strategy</span>
      </label>
    </fieldset>

    <div class="automation-section">Games</div>
    <fieldset :disabled="state.running">
      <div class="automation-row">
        <span>Recorded: {{ state.gamesCount }}</span>
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.gamesCount" @click="run(() => manager.ClearGames())">Clear</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" @click="importInput?.click()">Import</button>
        <input ref="importInput" type="file" accept=".csv" class="d-none" aria-label="Import games" @change="importGames">
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.gamesCount" @click="download('games.csv', manager.ExportGames(), 'text/csv')">Export</button>
      </div>
      <div class="automation-row">
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.gamesCount" @click="download('demo_menu.xml', manager.ExportTruservDemoXml(), 'application/xml')">Export Truserv Demo XML</button>
        <button type="button" class="btn btn-outline-secondary btn-sm" :disabled="!state.gamesCount" @click="download('gameloader.xml', manager.ExportTruservGameloaderXml(), 'application/xml')">Export Truserv Gameloader XML</button>
      </div>
    </fieldset>

    <div class="automation-section">Replay Games</div>
    <fieldset :disabled="state.running || state.gameInProgress || !state.gamesCount">
      <div class="automation-row">
        <label class="automation-field mb-0">
          <input type="number" class="form-control form-control-sm" :min="1" :max="state.gamesCount" :value="state.replayGame" @change="run(() => (manager.m_replayGame = number($event)))">
          <span>Game</span>
        </label>
        <button type="button" class="btn btn-outline-primary btn-sm" @click="run(() => manager.ReplayGame(state.replayGame))">Replay #{{ state.replayGame }}</button>
        <button type="button" class="btn btn-outline-primary btn-sm" @click="run(() => manager.ReplayAllGames())">Replay All</button>
      </div>
    </fieldset>

    <div class="automation-section">Generate Games</div>
    <fieldset :disabled="state.running || state.gameInProgress">
      <label class="automation-field">
        <select class="custom-select custom-select-sm" :value="state.seedMode" @change="run(() => (manager.m_generateSeedMode = Number(($event.target as HTMLSelectElement).value)))">
          <option v-for="(label, index) in SeedModeLabels" :key="index" :value="index">{{ label }}</option>
        </select>
        <span>Seed Mode</span>
      </label>
      <label class="automation-field">
        <input type="number" class="form-control form-control-sm" :disabled="state.seedMode === SeedMode.None" :value="state.seed" @change="run(() => (manager.m_generateSeed = number($event) >>> 0))">
        <span>Seed</span>
      </label>
      <label class="automation-field">
        <input type="number" class="form-control form-control-sm" min="1" :value="state.count" @change="run(() => (manager.m_generateCount = Math.max(0, Math.trunc(number($event)))))">
        <span>Count</span>
      </label>
      <div class="automation-row">
        <button type="button" class="btn btn-primary btn-sm" :disabled="state.count > MaxGenerateCount || state.count <= 0" @click="run(() => manager.GenerateGames(state.count))">Generate</button>
        <span v-if="state.gameInProgress" class="text-muted">Note: requires idle!</span>
      </div>
    </fieldset>
  </ToolWindow>
</template>

<style scoped lang="scss">
fieldset {
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.automation-section {
  margin: 0.6rem 0 0.35rem;
  padding-top: 0.35rem;
  border-top: 1px solid #dee2e6;
  font-weight: 600;

  &:first-child {
    margin-top: 0;
    padding-top: 0;
    border-top: 0;
  }
}

.automation-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.35rem;
  margin-bottom: 0.35rem;
}

.automation-field {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.35rem;

  select,
  input {
    width: 12rem;
  }
}

.automation-running {
  color: #009900;
  font-weight: 600;
}
</style>
