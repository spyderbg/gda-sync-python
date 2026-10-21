<script setup lang="ts">
// The Play page: the active workspace's game, played in the browser from the same resources the asset library lists
// (its asset report) and the game's own descriptors, math and modules config, all read through the backend.
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { config, navigate, notify, openGameExport, openGameSource, session } from '../workspace';
import { GameApp } from '@game/app/GameApp';
import { type GameAssetReport, GameBackend, type GameProject } from '@game/app/GameBackend';
import { AudioManager } from '@game/engine/AudioManager/AudioManager';
import type { TransitionRecord, TransitSource } from '@game/engine/Fsm/Fsm';
import type { HwButtonName } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ResourceManager } from '@game/engine/ResourceManager/ResourceManager';
import { VideoManager } from '@game/engine/VideoManager/VideoManager';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { EInfoViewPageType } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.data';
import { BurningCrownTetraSpins10Fsm } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10Fsm/BurningCrownTetraSpins10Fsm';
import { BurningCrownTetraSpins10InfoView } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10InfoView/BurningCrownTetraSpins10InfoView';
import { BurningCrownTetraSpins10View } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10View/BurningCrownTetraSpins10View';
import { AlphaFamilyGameflow, type RoundPreset } from '@game/integration/AlphaFamilyGameflow/AlphaFamilyGameflow';
import { BrowserKernel } from '@game/integration/BrowserKernel/BrowserKernel';
import { ExportPlugin, type PluginExport } from '@game/export/PluginExporter';
import { MODULES } from '@game/app/ModuleRegistry';
import { BurningCrownTetraSpins10Math } from '@game/alpha_family/plugins/burning_crown_tetra_spins_10/BurningCrownTetraSpins10Math/BurningCrownTetraSpins10Math';

const report = shallowRef<GameAssetReport | null>(null);
const reportError = ref('');
const project = shallowRef<GameProject | null>(null);
const state = ref<'loading' | 'starting' | 'running' | 'unsupported' | 'error'>('loading');
const error = ref('');
const stage = ref<HTMLElement | null>(null);
const canvas = ref<HTMLCanvasElement | null>(null);
const infoCanvas = ref<HTMLCanvasElement | null>(null);
const topperCanvas = ref<HTMLCanvasElement | null>(null);
/** Whether the topper screen shows. */
const topperOpen = ref(false);
/** Whether the info screen shows; Info opens it. */
const infoOpen = ref(false);
const devOpen = ref(false);
const exportResult = ref<{ folder: string; id: string; files: string[] } | null>(null);
const exportReport = shallowRef<PluginExport['report'] | null>(null);
/** Whether the export translates all the game's views from TypeScript, not only those changed in the browser. */
const exportAllViews = ref(false);
let app: GameApp | null = null;

/** A transition as the developer panel shows it, like the C++ GameFsmViewer: the active leaf state before and after,
 * and the function that asked for it on its state. */
interface TransitionRow {
  from: string;
  to: string;
  source: TransitSource;
  details: string;
}

/** The active states up to the view manager (the managers around the game's states), then the game's states. */
const managerStates = computed(() => live.states.slice(0, live.states.indexOf('ViewManager') + 1));
const gameStates = computed(() => live.states.slice(live.states.indexOf('ViewManager') + 1));

/** Opens in VS Code the TypeScript line that asked for a transition. */
async function openTransitSource(source: TransitSource) {
  // loaded when first used: only the developer panel's links need it
  const { OriginalPosition } = await import('@game/app/SourceLocation');
  const position = await OriginalPosition(source.file, source.line, source.column);
  if (position) await openGameSource(position.file, position.line);
  else notify(`Cannot tell where ${source.function} asked for the transition: its script has no source map.`, true);
}

function TransitionRowOf(record: TransitionRecord, start: number): TransitionRow {
  const to = record.created[record.created.length - 1] ?? record.to;
  const lines = [`${record.from} → ${record.to}`, ...record.destroyed.map(name => `  − ${name}`), ...record.created.map(name => `  + ${name}`)];
  lines.push(`${record.source.function}${record.source.state ? ` on ${record.source.state}` : ''}, at ${((record.time - start) / 1000).toFixed(3)} s`);
  return {
    from: record.destroyed[0] ?? '', to,
    source: record.source,
    details: lines.join('\n'),
  };
}

/** What the page shows of the game, refreshed a few times a second. */
const live = reactive({
  credit: 0,
  buttons: {} as Partial<Record<HwButtonName, { enabled: boolean }>>,
  states: [] as string[],
  match: null as ReturnType<AlphaFamilyGameflow['GetMatchSnapshot']>,
  transitions: [] as TransitionRow[],
  preset: '',
  history: [] as { roundType: string; bet: number; win: number }[],
  infoPage: '',
  images: '',
  capping: 0,
  setupCapping: 0,
});

/** A maximum award a main win reaches, below the tetra round's trigger (4× a bet of 1.00), to see the capping splash. */
const TEST_CAPPING = 300;

function setCapping(capping: number) {
  kernel()?.SetCapping(capping);
}

const formatCredit = (value: number) => BrowserKernel.FormatCurrency(value);
const kernel = () => app?.Get(BrowserKernel) ?? null;
const gameflow = () => app?.Get(AlphaFamilyGameflow) ?? null;

const PANEL: { name: HwButtonName; label: string; key: string; icon: string }[] = [
  { name: 'Exit', label: 'Exit', key: 'the panel only', icon: 'mdi-exit-to-app' },
  { name: 'Info', label: 'Info', key: 'I', icon: 'mdi-information-outline' },
  { name: 'Cashout', label: 'Collect', key: 'C', icon: 'mdi-cash-multiple' },
  { name: 'DecreaseBet', label: 'Bet −', key: '↓', icon: 'mdi-minus' },
  { name: 'IncreaseBet', label: 'Bet +', key: '↑', icon: 'mdi-plus' },
  { name: 'MaxBet', label: 'Max bet', key: 'M', icon: 'mdi-arrow-collapse-up' },
  { name: 'AutoPlay', label: 'Autoplay', key: 'A', icon: 'mdi-autorenew' },
  { name: 'Start', label: 'Start', key: 'Space', icon: 'mdi-play' },
];
const KEYS: Record<string, HwButtonName> = {
  ' ': 'Start', Enter: 'Start', a: 'AutoPlay', A: 'AutoPlay', ArrowUp: 'IncreaseBet', ArrowDown: 'DecreaseBet', m: 'MaxBet', M: 'MaxBet',
  i: 'Info', I: 'Info', c: 'Cashout', C: 'Cashout',
};

const presets = computed<RoundPreset[]>(() => {
  const bet = (result: Parameters<RoundPreset['condition']>[0]) => result.GetBet();
  const win = (result: Parameters<RoundPreset['condition']>[0]) => result.GetSummary().rewards.Get(Currency.Credits);
  return [
    { roundType: RoundType.Main, name: 'Main: win ≥ 4× bet (enters the tetra round)', condition: result => win(result) >= 4 * bet(result) },
    { roundType: RoundType.Main, name: 'Main: big win (≥ 25× bet)', condition: result => win(result) >= 25 * bet(result) },
    { roundType: RoundType.Main, name: 'Main: no win', condition: result => win(result) === 0 },
    { roundType: RoundType.Tetra, name: 'Tetra: win ≥ 2× bet', condition: result => win(result) >= 2 * bet(result) },
  ];
});

function refreshLive() {
  const k = kernel();
  const flow = gameflow();
  if (!k || !flow) return;
  live.credit = k.GetCredit();
  live.capping = k.GetCapping();
  live.setupCapping = k.GetConfiguredCapping();
  live.buttons = k.GetButtonStates();
  const fsm = app?.Get(BurningCrownTetraSpins10Fsm)?.GetMachine();
  live.states = fsm?.ActiveStates() ?? [];
  const transitions = fsm?.transitions ?? [];
  live.transitions = transitions.slice(-50).reverse().map(item => TransitionRowOf(item, transitions[0].time));
  live.match = flow.GetMatchSnapshot();
  live.preset = flow.GetRoundPreset()?.name ?? '';
  live.history = flow.history.slice(-8).reverse().map(item => ({ roundType: RoundType[item.roundType], bet: item.bet, win: item.win }));
  const pages = app?.Get(BurningCrownTetraSpins10InfoView)?.GetInfoView()?.GetPages();
  live.infoPage = pages ? EInfoViewPageType[pages.current] : '';
  const images = app?.Get(VideoManager)?.TryGetImages();
  live.images = images ? `${images.loadedCount} / ${images.size}` : '';
}

async function start() {
  if (app || !canvas.value || !project.value) return;
  state.value = 'starting';
  app = new GameApp();
  app.onError = failure => {
    state.value = 'error';
    error.value = failure.message;
  };
  let last = 0;
  app.onFrame = () => {
    const now = performance.now();
    if (now - last > 200) {
      last = now;
      refreshLive();
    }
  };
  try {
    await app.Start({
      canvas: canvas.value, infoCanvas: infoCanvas.value, topperCanvas: topperCanvas.value, project: project.value, report: report.value,
      kernel: { minBet: 0, onExit: () => navigate('library') },
    });
    state.value = 'running';
    refreshLive();
  } catch (failure) {
    app.Stop();
    app = null;
    state.value = 'error';
    error.value = (failure as Error).message;
  }
}

function stop() {
  app?.Stop();
  app = null;
}

async function load() {
  stop();
  state.value = 'loading';
  error.value = '';
  try {
    // The same asset report the asset library lists: the game uses the declared files it lists as available.
    const [loaded, assets] = await Promise.all([GameBackend.Project(), GameBackend.AssetReport().catch((failure: Error) => {
      reportError.value = failure.message;
      return null;
    })]);
    project.value = loaded;
    report.value = assets;
    if (!GameApp.CanPlay(project.value)) {
      state.value = 'unsupported';
      return;
    }
    await nextTick();
    await start();
  } catch (failure) {
    state.value = 'error';
    error.value = (failure as Error).message;
  }
}

function press(name: HwButtonName) {
  // Info shows the next help page on the info screen, which opens with it.
  if (name === 'Info' && live.buttons.Info?.enabled) infoOpen.value = true;
  kernel()?.PressButton(name);
  refreshLive();
}

function cashIn(amount: number) {
  kernel()?.CashIn(amount);
  refreshLive();
}

function setPreset(preset: RoundPreset | null) {
  gameflow()?.SetRoundPreset(preset);
  refreshLive();
}

function fullscreen() {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void stage.value?.requestFullscreen?.();
}

function onKeydown(event: KeyboardEvent) {
  if (state.value !== 'running' || event.ctrlKey || event.metaKey || event.altKey) return;
  // On the game's page the keys are the cabinet's: Space is START even when a button has the focus.
  const target = event.target as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
  if (document.querySelector('.modal.show')) return;
  const name = KEYS[event.key];
  if (!name) return;
  event.preventDefault();
  press(name);
}

const problems = computed(() => {
  void live.images;
  const resources = app?.Get(ResourceManager);
  const failed = [...(app?.Get(VideoManager)?.TryGetImages()?.failed ?? [])].map(file => ({ kind: 'File', id: file.split('/').pop() ?? file, message: 'could not be loaded' }));
  const audio = (app?.Get(AudioManager)?.MissingEvents() ?? []).map(id => ({ kind: 'AudioEvent', id, message: 'no audio event has this id' }));
  return [...(resources?.problems ?? []), ...failed, ...audio];
});

async function exportCpp() {
  const fsm = app?.Get(BurningCrownTetraSpins10Fsm)?.GetMachine();
  const viewModule = app?.Get(BurningCrownTetraSpins10View);
  if (!fsm || !viewModule || !project.value) return;
  try {
    const gameName = 'BurningCrownTetraSpins10';
    const plugin = MODULES[`${gameName}Fsm`]?.plugin ?? project.value.workspace.id;
    const exported = await ExportPlugin({ gameName, plugin, project: project.value, fsm: fsm.root, viewGroups: viewModule.GetViewGroups(),
      math: app?.Get(BurningCrownTetraSpins10Math)?.GetMathExport() }, session.token, { translateAllViews: exportAllViews.value });
    exportReport.value = exported.report;
    exportResult.value = await GameBackend.Export(gameName, exported.files, session.token, exported.copies);
    notify(`Exported ${exportResult.value.files.length} files to ${exportResult.value.folder}`);
  } catch (failure) {
    notify(`Export failed: ${(failure as Error).message}`, true);
  }
}

watch(() => config.value?.defaultWorkspace, (workspace, previous) => {
  if (previous !== undefined && workspace !== previous) void load();
});

onMounted(() => {
  window.addEventListener('keydown', onKeydown);
  void load();
});
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown);
  stop();
});
</script>

<template>
  <PageHeader :title="project ? `Play ${project.workspace.name}` : 'Play'">
    <template #links>
      <li><span>The game in the browser, from the asset library's resources</span></li>
    </template>
    <template #links-right>
      <li v-if="state === 'running'"><span>Credit {{ formatCredit(live.credit) }}</span></li>
    </template>
  </PageHeader>

  <div v-if="state === 'loading'" class="card"><div class="card-body text-muted"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Loading the game project…</div></div>
  <div v-else-if="state === 'unsupported'" class="card">
    <div class="card-body">
      <h5 class="card-title">This game cannot be played in the browser yet</h5>
      <p class="mb-2">The browser game has the modules of Burning Crown Tetra Spins 10. This workspace's modules config
        <code v-if="project?.modules">{{ project.modules.file }}</code><span v-else>(configs/{{ project?.workspace.id }}/modules)</span> names:</p>
      <ul class="mb-0"><li v-for="module in project?.modules?.config.modules ?? []" :key="module.name"><code>{{ module.name }}</code></li></ul>
    </div>
  </div>
  <div v-else-if="state === 'error'" class="alert alert-danger" role="alert">
    <strong>The game stopped:</strong> {{ error }}
    <button type="button" class="btn btn-outline-danger btn-sm ml-2" @click="load">Restart</button>
  </div>

  <div v-show="state === 'starting' || state === 'running'" class="game-page">
    <div class="card game-card">
      <div class="card-body p-0">
        <div ref="stage" class="game-stage">
          <canvas ref="canvas" class="game-canvas" aria-label="Game screen" />
          <div v-if="state === 'starting'" class="game-overlay"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Loading the game's data…</div>
        </div>
        <div class="game-panel">
          <button v-for="button in PANEL" :key="button.name" type="button" :class="['btn', button.name === 'Start' ? 'btn-success' : 'btn-outline-secondary', 'btn-sm']"
            :disabled="!live.buttons[button.name]?.enabled" :title="`${button.label} (${button.key})`" @click="press(button.name)">
            <i :class="['mdi', button.icon]" aria-hidden="true" /> {{ button.label }}
          </button>
          <span class="game-panel-gap" />
          <button type="button" class="btn btn-outline-primary btn-sm" title="Insert credit" @click="cashIn(1000)">+10.00</button>
          <button type="button" class="btn btn-outline-primary btn-sm" title="Insert credit" @click="cashIn(10000)">+100.00</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" title="Full screen" aria-label="Full screen" @click="fullscreen"><i class="mdi mdi-fullscreen" aria-hidden="true" /></button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="infoOpen" title="The cabinet's info screen, with the help pages" @click="infoOpen = !infoOpen"><i class="mdi mdi-monitor" aria-hidden="true" /> Info screen</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="topperOpen" title="The cabinet's topper screen" @click="topperOpen = !topperOpen"><i class="mdi mdi-monitor-shimmer" aria-hidden="true" /> Topper</button>
          <button type="button" class="btn btn-outline-secondary btn-sm" :aria-expanded="devOpen" @click="devOpen = !devOpen"><i class="mdi mdi-code-tags" aria-hidden="true" /> Developer</button>
        </div>
      </div>
    </div>

    <div v-show="topperOpen" class="card game-card game-info-card">
      <div class="card-body p-0">
        <div class="game-stage">
          <canvas ref="topperCanvas" class="game-canvas" aria-label="Topper screen" />
        </div>
      </div>
    </div>

    <div v-show="infoOpen" class="card game-card game-info-card">
      <div class="card-body p-0">
        <div class="game-stage">
          <canvas ref="infoCanvas" class="game-canvas" aria-label="Info screen" />
        </div>
        <p class="game-info-note small text-muted mb-0">The info screen: the help pages of the game's RTF, drawn with the app's font. Info shows the next page.</p>
      </div>
    </div>

    <div v-if="devOpen" class="card game-dev">
      <div class="card-body">
        <div class="row">
          <div class="col-lg-5">
            <h6>State machine</h6>
            <dl class="game-dev-states">
              <dt class="text-muted">Managers</dt><dd><code>{{ managerStates.join(' › ') || '–' }}</code></dd>
              <dt class="text-muted">Game</dt><dd><code>{{ gameStates.join(' › ') || '–' }}</code></dd>
            </dl>
            <h6>Transitions <small class="text-muted">newest first</small></h6>
            <div class="game-dev-transitions">
              <table class="table table-sm mb-0">
                <thead><tr><th scope="col">From → to</th><th scope="col">Source</th></tr></thead>
                <tbody>
                  <tr v-for="(item, index) in live.transitions" :key="index" :title="item.details">
                    <td><code>{{ item.from }}<template v-if="item.from"> → </template>{{ item.to }}</code></td>
                    <td>
                      <button v-if="item.source.file" type="button" class="game-dev-source" title="Open in VS Code where the transition was asked for" @click="openTransitSource(item.source)">
                        <code><template v-if="item.source.state">{{ item.source.state }}::<wbr></template>{{ item.source.function }}</code>
                      </button>
                      <code v-else>{{ item.source.function }}</code>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
          <div class="col-lg-3">
            <h6>Match</h6>
            <pre v-if="live.match" class="game-dev-pre">{{ JSON.stringify(live.match, null, 1) }}</pre>
            <p v-else class="text-muted">No match.</p>
            <h6>Rounds</h6>
            <ol class="game-dev-list"><li v-for="(item, index) in live.history" :key="index">{{ item.roundType }}: bet {{ formatCredit(item.bet) }}, win {{ formatCredit(item.win) }}</li></ol>
          </div>
          <div class="col-lg-4">
            <h6>Next round</h6>
            <div class="btn-group-vertical w-100 mb-2">
              <button v-for="preset in presets" :key="preset.name" type="button" :class="['btn', 'btn-sm', live.preset === preset.name ? 'btn-primary' : 'btn-outline-primary']" @click="setPreset(preset)">{{ preset.name }}</button>
              <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!live.preset" @click="setPreset(null)">Random (the kernel's numbers)</button>
            </div>
            <h6>Maximum award</h6>
            <div class="btn-group btn-group-sm w-100 mb-2" role="group" aria-label="Maximum award">
              <button type="button" :class="['btn', live.capping === live.setupCapping ? 'btn-primary' : 'btn-outline-primary']" @click="setCapping(live.setupCapping)">The setup's ({{ formatCredit(live.setupCapping) }})</button>
              <button type="button" :class="['btn', live.capping === TEST_CAPPING ? 'btn-primary' : 'btn-outline-primary']" @click="setCapping(TEST_CAPPING)">{{ formatCredit(TEST_CAPPING) }}, to test it</button>
            </div>
            <h6>Export</h6>
            <p class="small mb-2">Writes the game's whole C++ plugin to the app data folder: its state machine, math module (rules from the math description), view module and modules config generated, its other sources copied from the C++ game, and the C++ the translator writes from the TypeScript of the states and views changed or made in the browser.</p>
            <div class="form-check mb-2">
              <input id="game-export-all-views" v-model="exportAllViews" class="form-check-input" type="checkbox">
              <label class="form-check-label small" for="game-export-all-views">Translate all the game's views from TypeScript (else only those changed in the browser)</label>
            </div>
            <button type="button" class="btn btn-sm btn-outline-primary" @click="exportCpp"><i class="mdi mdi-export" aria-hidden="true" /> Export to C++</button>
            <div v-if="exportResult" class="game-export-folder small mt-2">
              <span>Exported {{ exportResult.files.length }} files to <code>{{ exportResult.folder }}</code></span>
              <button type="button" class="details-icon" aria-label="Open the export's folder" title="Open the export's folder" @click="openGameExport(exportResult.id)"><i aria-hidden="true" class="mdi mdi-folder-open-outline" /></button>
            </div>
            <template v-if="exportReport">
              <p class="small mb-0">{{ exportReport.generated.length }} generated, {{ exportReport.copied.length }} copied,
                {{ exportReport.updated.length }} updated, {{ exportReport.translated.length }} translated, {{ exportReport.skeletons.length }} new view skeletons</p>
              <p class="small mb-0"><strong :class="{ 'text-danger': exportReport.changed.length }">{{ exportReport.changed.length }} to update by hand</strong>
                (see <button v-if="exportResult" type="button" class="game-dev-link" title="Open the export's README in VS Code" @click="openGameExport(exportResult.id, 'README.md')">its README</button><template v-else>its README</template>)</p>
            </template>
          </div>
        </div>
        <h6 class="mt-3">Resources <small class="text-muted">images loaded {{ live.images }}<span v-if="!report">, no asset report ({{ reportError || 'none yet' }}): every declared file is used</span></small></h6>
        <p v-if="!problems.length" class="text-muted small mb-0">Every resource the game used so far is in the asset report.</p>
        <ul v-else class="game-dev-list small"><li v-for="(problem, index) in problems" :key="index"><strong>{{ problem.kind }}</strong> {{ problem.id }}: {{ problem.message }}</li></ul>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.game-page {
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

.game-card {
  overflow: hidden;
}

.game-info-card {
  margin-top: 1rem;
}

.game-info-note {
  padding: 6px 12px;
}

.game-stage {
  position: relative;
  background: #000;
  aspect-ratio: 16 / 9;
  max-height: calc(100vh - 220px);
  margin: 0 auto;
  width: 100%;

  &:fullscreen {
    max-height: none;
    aspect-ratio: auto;
    display: flex;
    align-items: center;
    justify-content: center;
  }
}

.game-canvas {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: contain;
  touch-action: manipulation;
  user-select: none;
}

.game-overlay {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  gap: 0.5rem;
}

.game-panel {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1rem;
}

.game-panel-gap {
  flex: 1 1 auto;
}

.game-dev-states {
  display: grid;
  grid-template-columns: auto 1fr;
  column-gap: 0.75rem;
  row-gap: 0.25rem;

  dt {
    font-weight: normal;
  }

  dd {
    margin: 0;
  }

  code {
    white-space: normal;
  }
}

.game-dev-transitions {
  max-height: 260px;
  margin-bottom: 0.75rem;
  overflow: auto;

  // the theme's table cells do not wrap and are 35px high
  th,
  td {
    height: auto;
    white-space: normal;
    padding: 0.2rem 0.5rem 0.2rem 0;
    font-size: 0.8rem;
    line-height: 1.3;
  }

  code {
    font-size: inherit;
  }
}

// the export's README: a link that opens it
.game-dev-link {
  padding: 0;
  border: 0;
  background: none;
  color: #4b49ac;
  font: inherit;
  cursor: pointer;

  &:hover,
  &:focus-visible {
    text-decoration: underline;
  }
}

.game-export-folder {
  display: flex;
  align-items: center;
  gap: 4px;

  code {
    overflow-wrap: anywhere;
  }
}

// a source is a link to the TypeScript
.game-dev-source {
  padding: 0;
  border: 0;
  background: none;
  text-align: left;
  cursor: pointer;

  &:hover code,
  &:focus-visible code {
    text-decoration: underline;
  }
}

.game-dev-list {
  padding-left: 1.25rem;
  margin-bottom: 0.75rem;
  max-height: 220px;
  overflow: auto;
}

.game-dev-pre {
  font-size: 0.75rem;
  max-height: 220px;
  overflow: auto;
}
</style>
