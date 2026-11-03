<script setup lang="ts">
// The Game tools page (/game-tools): the game's debug tools in a browser window of their own, beside the game or on
// another screen, so that they do not cover it. It plays nothing: its tools, the RNG Queue, the RNG Presets and the RNG
// Picker, change the game server's RNG Queue, which the game takes its rounds' sequences from in whatever window it
// plays (the Play page), and they follow that game through the server (the RNG Picker's Tab Sync). Every window of the
// tools, this page's and the Play page's, shows the same queue. Open it from the Play page (Tools › Open in a new
// window), or at its address in any window.
import { computed, onBeforeUnmount, onMounted, ref, shallowRef } from 'vue';
import AppToast from '../components/AppToast.vue';
import { useBackendLifetime } from '../composables/useBackendLifetime';
import { api, session } from '../workspace';
import { GameApp } from '@game/app/GameApp';
import { GameBackend, type GameProject } from '@game/app/GameBackend';
import { DebugImguiOverlay } from '@game/engine/DebugImguiOverlay/DebugImguiOverlay';
import { SetSettingsScope } from '@game/engine/ImGuiEx/Extensions/Utils';
import { GameServer } from '@game/integration/GameServer/GameServer';
import { RemoteGame } from '@game/integration/GameServer/RemoteGame';
import { RngPresetManager } from '@game/integration/RngPresetManager/RngPresetManager';
import { AlphaFamilyMathRngPreset } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngPreset/AlphaFamilyMathRngPreset';
import { AlphaFamilyMathRngTool } from '@game/alpha_family/plugins/alpha_family/AlphaFamilyMathRngTool/AlphaFamilyMathRngTool';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import RngQueueWindow from './debug/RngQueueWindow.vue';
import RngQueueUnlockWindow from './debug/RngQueueUnlockWindow.vue';
import RngPresetWindow from './debug/RngPresetWindow.vue';
import RngPickerWindow from './debug/RngPickerWindow.vue';
import ToolsMenu from './debug/ToolsMenu.vue';
import { SaveGameToolsPlace } from './debug/GameToolsWindow';

// this page's windows open and close apart from the game's (C++: each process has its imgui_params.ini)
SetSettingsScope('tools');

useBackendLifetime(() => true);

const state = ref<'loading' | 'running' | 'unsupported' | 'error'>('loading');
const error = ref('');
const project = shallowRef<GameProject | null>(null);
/** The tools' windows: redrawn a few times a second and after their commands. */
const tick = ref(0);
const serverError = ref('');
let app: GameApp | null = null;
let server: GameServer | null = null;
let timer = 0;

const toolWindows = computed(() => {
  void tick.value;
  const rngQueue = app?.Get(RngPresetManager) ?? null;
  const rngPreset = app?.Get(AlphaFamilyMathRngPreset) ?? null;
  const rngPicker = app?.Get(AlphaFamilyMathRngTool) ?? null;
  return {
    rngPicker: rngPicker?.m_imguiWindowOpen.value ? rngPicker : null,
    rngPreset: rngPreset?.m_imguiWindowOpen.value ? rngPreset : null,
    rngQueue: rngQueue?.m_imguiWindowOpen.value ? rngQueue : null,
    rngQueueUnlock: rngQueue?.m_imguiUnlockWindowOpen.value ? rngQueue : null,
  };
});

/** What the game last did that the tools follow, from the server. */
const lastGameEvent = computed(() => {
  void tick.value;
  const event = app?.Get(RemoteGame)?.lastEvent;
  if (!event) return '';
  const round = (type: number) => RoundType[type] ?? String(type);
  switch (event.event) {
    case 'roundStarting': return `a ${round(event.roundType)} round started`;
    case 'roundEnded': return event.idle ? `the game ended` : `a ${round(event.roundType)} round ended, ${round(event.nextRoundType)} is next`;
    case 'takeCoinsPressed': return 'Take win was pressed';
    case 'cashoutPressed': return 'Collect was pressed';
    case 'gamblePressed': return 'Gamble was pressed';
    default: return '';
  }
});

function buildToolsMenu() {
  return app?.Get(DebugImguiOverlay)?.GetMainMenuBar().Menu('Tools') ?? [];
}

function refresh() {
  tick.value++;
  // the game of the workspace the app plays now
  if (state.value === 'running' && server?.activeWorkspace && server.activeWorkspace !== project.value?.workspace.id) void load();
}

async function load() {
  stop();
  state.value = 'loading';
  error.value = '';
  try {
    const response = await fetch('/api/session', { cache: 'no-store' });
    if (!response.ok) throw new Error('The app is not running');
    session.token = (await response.json()).token;
    const [loaded, report] = await Promise.all([GameBackend.Project(), GameBackend.AssetReport().catch(() => null)]);
    project.value = loaded;
    document.title = `${loaded.workspace.name} — game tools`;
    if (!GameApp.CanPlay(loaded)) {
      state.value = 'unsupported';
      return;
    }
    server = new GameServer((path, method, body) => api(path, method, body), loaded.workspace.id);
    server.onError = message => {
      serverError.value = message;
    };
    app = new GameApp();
    app.onError = failure => {
      state.value = 'error';
      error.value = failure.message;
    };
    await app.StartTools({ project: loaded, report, server });
    // a page with no window open shows the queue
    const windows = toolWindows.value;
    if (!windows.rngQueue && !windows.rngPreset && !windows.rngPicker && !windows.rngQueueUnlock) {
      const rngQueue = app.Get(RngPresetManager);
      if (rngQueue?.AreMathDetailsHidden()) rngQueue.m_imguiUnlockWindowOpen.value = true;
      else if (rngQueue) rngQueue.m_imguiWindowOpen.value = true;
    }
    state.value = 'running';
    tick.value++;
  } catch (failure) {
    stop();
    state.value = 'error';
    error.value = (failure as Error).message;
  }
}

function stop() {
  app?.Stop();
  app = null;
  server = null;
  serverError.value = '';
  tick.value++;
}

onMounted(() => {
  window.addEventListener('pagehide', SaveGameToolsPlace);
  timer = window.setInterval(refresh, 200);
  void load();
});
onBeforeUnmount(() => {
  window.removeEventListener('pagehide', SaveGameToolsPlace);
  window.clearInterval(timer);
  stop();
});
</script>

<template>
  <div class="game-tools-page">
    <header class="game-tools-bar">
      <ToolsMenu v-if="state === 'running'" :build="buildToolsMenu" :page-items="[]" opens="down" @selected="tick++" />
      <strong>{{ project?.workspace.name ?? 'Game' }} — game tools</strong>
      <span v-if="state === 'loading'" class="text-muted"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Loading the game's tools…</span>
      <span v-else-if="state === 'running'" class="text-muted">
        The RNG Queue is the game server's: the game takes its rounds' numbers from it in the Play page, in any window.
        <template v-if="lastGameEvent"> The game: {{ lastGameEvent }}.</template>
      </span>
      <span v-if="serverError" class="text-danger" role="alert"><i class="mdi mdi-lan-disconnect" aria-hidden="true" /> The game server does not answer: {{ serverError }}</span>
    </header>

    <div v-if="state === 'error'" class="alert alert-danger m-3" role="alert">
      <strong>The tools stopped:</strong> {{ error }}
      <button type="button" class="btn btn-outline-danger btn-sm ml-2" @click="load">Restart</button>
    </div>
    <p v-else-if="state === 'unsupported'" class="m-3">The browser game cannot play this workspace's game yet, so it has no tools for it.</p>

    <RngQueueWindow v-if="toolWindows.rngQueue" :manager="toolWindows.rngQueue" :tick="tick" @changed="tick++" />
    <RngPickerWindow v-if="toolWindows.rngPicker" :module="toolWindows.rngPicker" :tick="tick" @changed="tick++" />
    <RngPresetWindow v-if="toolWindows.rngPreset" :module="toolWindows.rngPreset" :tick="tick" @changed="tick++" />
    <RngQueueUnlockWindow v-if="toolWindows.rngQueueUnlock" :manager="toolWindows.rngQueueUnlock" :tick="tick" @changed="tick++" />
    <AppToast />
  </div>
</template>

<style scoped lang="scss">
.game-tools-page {
  min-height: 100vh;
  background: #f4f5f7;
}

// over the tools' windows, with its Tools menu
.game-tools-bar {
  position: sticky;
  z-index: 100000;
  top: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 0.75rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid #e3e3e3;
  background: #fff;
  font-size: 0.85rem;
}
</style>
