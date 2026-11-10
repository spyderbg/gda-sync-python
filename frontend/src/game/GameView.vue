<script setup lang="ts">
// The Play page: the active workspace's game, played in the browser from the same resources the asset library lists
// (its asset report) and the game's own descriptors, math and modules config, all read through the backend. The game is
// a server based game: the backend's game server deals its rounds' random numbers and keeps the RNG Queue
// (integration/GameServer). Play and Tools share this instance so navigation keeps the game running.
//
// The page is kept while another page of the app shows (App.vue's KeepAlive), and its game plays on, as a game left
// open does: back on Play, the game is where it is, with the resources changed meanwhile (its views, descriptors and
// IData reload as they change). It starts anew after the Exit button, which ends it, after another workspace becomes
// the active one, and after it failed.
import { computed, nextTick, onActivated, onBeforeUnmount, onDeactivated, onMounted, reactive, ref, shallowRef, watch } from 'vue';
import PageHeader from '../components/PageHeader.vue';
import { api, config, navigate, notify, openGameExport, openGameSource, session } from '../workspace';
import { GameApp } from '@game/app/GameApp';
import { type GameAssetReport, GameBackend, type GameProject } from '@game/app/GameBackend';
import { AudioManager } from '@game/engine/AudioManager/AudioManager';
import type { TransitionRecord, TransitSource } from '@game/engine/Fsm/Fsm';
import type { HwButtonName } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ResourceManager } from '@game/engine/ResourceManager/ResourceManager';
import { VideoManager } from '@game/engine/VideoManager/VideoManager';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { EInfoViewPageType } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { AlphaFamilyGameflow, type RoundPreset } from '@game/integration/AlphaFamilyGameflow/AlphaFamilyGameflow';
import { BrowserKernel } from '@game/integration/BrowserKernel/BrowserKernel';
import { ExportPlugin, type PluginExport } from '@game/export/PluginExporter';
import { MODULES } from '@game/app/ModuleRegistry';
import type { GameFsm } from '@game/engine/Game/Fsm/GameFsm';
import type { InfoViewPages, ViewModule } from '@game/app/GameModules';
import type { MathExportInput } from '@game/export/MathExporter';
import { DebugImguiOverlay } from '@game/engine/DebugImguiOverlay/DebugImguiOverlay';
import GameToolsPanel from './GameToolsPanel.vue';
import GameClock from './debug/GameClock.vue';
import { GameServer } from '@game/integration/GameServer/GameServer';
import { AutomationManager } from '@game/integration/AutomationManager/AutomationManager';

const props = defineProps<{ toolsPage?: boolean }>();

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
const statsOpen = ref(false);
const devOpen = ref(false);
/** Refreshes the tools' panels after game frames and their commands. */
const toolsTick = ref(0);
/** The Automation window's game clock, which the game's panel shows too: none without the automation manager. */
const automation = computed(() => {
  void toolsTick.value;
  return state.value === 'running' ? app?.Get(AutomationManager) ?? null : null;
});
/** Why the game server does not answer, while it does not: the game waits for its rounds' numbers. */
const serverError = ref('');
const exportResult = ref<{ folder: string; id: string; files: string[] } | null>(null);
const exportReport = shallowRef<PluginExport['report'] | null>(null);

/** The C++ changes to import into the TypeScript (export/import-cpp.mjs), and the agent's port of them. */
interface ImportChange { ts: string; cpp: string[]; commits: string[]; uncommitted: boolean }
interface ImportOutcome { ts: string; files?: string[]; before?: number | null; after?: number | null; reason?: string; account?: string }
interface ImportReport { changed: ImportChange[]; ported: ImportOutcome[]; upToDate?: ImportOutcome[]; failed: ImportOutcome[] }
/** A Claude Code agent's run: porting the C++ changes into the TypeScript (import), or an export's TypeScript changes
 * the translator could not translate into its C++ (export). */
interface ImportStatus {
  running: boolean; kind: 'import' | 'export' | 'import-game' | 'game-sync' | null; log: string[];
  result: (ImportReport & Partial<GameImportReport> & Partial<GameSyncReport>) | null; error: string | null;
}
/** What a /game-sync session (Port with Claude Code) reported: its last message, and what it cost. */
interface GameSyncReport { report: string; cost: number | null; turns: number | null }
/** A C++ game of the family to import (export/import-game.mjs): its files' plan, and what an import did. */
interface GameImportUnit { ts: string; cpp: string[]; mode: 'done' | 'copy' | 'diff' | 'port'; changed: number | null; template: string | null }
interface GameImportReport {
  plugin: string; gameName: string; template: { plugin: string; gameName: string } | null; units: GameImportUnit[];
  copied: ImportOutcome[]; ported: ImportOutcome[]; failed: ImportOutcome[]; skipped: ImportOutcome[]; left?: string[];
}
interface GameImports { games: { plugin: string; cppFiles: number; tsFiles: number }[]; workspace: string }
const gameImport = shallowRef<GameImportReport | null>(null);
const gameImportChecking = ref(false);
const importReport = shallowRef<ImportReport | null>(null);
const importStatus = shallowRef<ImportStatus | null>(null);
const importChecking = ref(false);
let importTimer: number | undefined;
/** Whether the export translates all the game's views from TypeScript, not only those changed in the browser. */
const exportAllViews = ref(false);
let app: GameApp | null = null;
/** Whether the page shows (it is kept while another page of the app shows). */
let shown = false;
/** Whether the game starts anew when the page shows: it has not started yet, or it ended while the page was away. */
let needsLoad = true;
/** Whether the game's Exit button left the game: it ends once the page has gone. */
let exited = false;

/** A transition as Game stats shows it, like the C++ GameFsmViewer: the active leaf state before and after,
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
  // loaded when first used: only Game stats' links need it
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
  /** The round types the game's math has: which presets and panel buttons the page shows. */
  roundTypes: [] as RoundType[],
});

/** A maximum award a main win reaches, below the tetra round's trigger (4× a bet of 1.00), to see the capping splash. */
const TEST_CAPPING = 300;

function setCapping(capping: number) {
  kernel()?.SetCapping(capping);
}

const formatCredit = (value: number) => BrowserKernel.FormatCurrency(value);
const kernel = () => app?.Get(BrowserKernel) ?? null;
const gameflow = () => app?.Get(AlphaFamilyGameflow) ?? null;

/** The cabinet's panel; a button that `requires` a round type shows for the games whose math has it. */
const PANEL: { name: HwButtonName; label: string; key: string; icon: string; requires?: RoundType }[] = [
  { name: 'Start', label: 'Start', key: 'Space', icon: 'mdi-play' },
  { name: 'Exit', label: 'Exit', key: 'the panel only', icon: 'mdi-exit-to-app' },
  { name: 'Info', label: 'Info', key: 'I', icon: 'mdi-information-outline' },
  { name: 'Cashout', label: 'Collect', key: 'C', icon: 'mdi-cash-multiple' },
  { name: 'Collect', label: 'Take win', key: 'T', icon: 'mdi-hand-coin-outline', requires: RoundType.Coins },
  { name: 'Gamble', label: 'Gamble', key: 'G', icon: 'mdi-cards-playing-outline', requires: RoundType.Gamble },
  { name: 'GambleRed', label: 'Red', key: 'R', icon: 'mdi-cards-heart', requires: RoundType.Gamble },
  { name: 'GambleBlack', label: 'Black', key: 'B', icon: 'mdi-cards-spade', requires: RoundType.Gamble },
  { name: 'DecreaseBet', label: 'Bet −', key: '↓', icon: 'mdi-minus' },
  { name: 'IncreaseBet', label: 'Bet +', key: '↑', icon: 'mdi-plus' },
  { name: 'MaxBet', label: 'Max bet', key: 'M', icon: 'mdi-arrow-collapse-up' },
  { name: 'AutoPlay', label: 'Autoplay', key: 'A', icon: 'mdi-autorenew' },
];
const KEYS: Record<string, HwButtonName> = {
  ' ': 'Start', Enter: 'Start', a: 'AutoPlay', A: 'AutoPlay', ArrowUp: 'IncreaseBet', ArrowDown: 'DecreaseBet', m: 'MaxBet', M: 'MaxBet',
  i: 'Info', I: 'Info', c: 'Cashout', C: 'Cashout', t: 'Collect', T: 'Collect', g: 'Gamble', G: 'Gamble', r: 'GambleRed', R: 'GambleRed',
  b: 'GambleBlack', B: 'GambleBlack',
};
const panel = computed(() => PANEL.filter(button => button.requires === undefined || live.roundTypes.includes(button.requires)));
const sessionButtons = computed(() => panel.value.filter(button => button.name === 'Start' || button.name === 'Exit'));
const cabinetButtons = computed(() => panel.value.filter(button => button.name !== 'Start' && button.name !== 'Exit'));

/** Game stats' rounds, of the round types the game's math has (and those a preset `requires`). */
const presets = computed<RoundPreset[]>(() => {
  type Result = Parameters<RoundPreset['condition']>[0];
  const bet = (result: Result) => result.GetBet();
  const credits = (result: Result) => result.GetSummary().rewards.Get(Currency.Credits);
  const coins = (result: Result) => result.GetSummary().rewards.Get(Currency.CoinsSpinEnergy);
  const freeSpins = (result: Result) => result.GetSummary().rewards.Get(Currency.FreeSpinEnergy);
  const holdAndSpinSpins = (result: Result) => result.GetSummary().rewards.Get(Currency.HoldAndSpinEnergy);
  // a main round pays credits, or coins in a coins game
  const win = (result: Result) => credits(result) + coins(result);
  const all: (RoundPreset & { requires?: RoundType })[] = [
    { roundType: RoundType.Main, name: 'Main: win ≥ 4× bet (enters the tetra round)', requires: RoundType.Tetra, condition: result => win(result) >= 4 * bet(result) },
    { roundType: RoundType.Main, name: 'Main: win coins (enters the coins round)', requires: RoundType.Coins, condition: result => coins(result) > 0 },
    { roundType: RoundType.Main, name: 'Main: 6 coins or more (enters the hold and spin round)', requires: RoundType.HoldAndSpin, condition: result => holdAndSpinSpins(result) > 0 },
    { roundType: RoundType.Main, name: 'Main: win free spins (enters the free round)', requires: RoundType.Free, condition: result => freeSpins(result) > 0 },
    { roundType: RoundType.Main, name: 'Main: big win (≥ 25× bet)', condition: result => win(result) >= 25 * bet(result) },
    { roundType: RoundType.Main, name: 'Main: no win', condition: result => win(result) === 0 },
    { roundType: RoundType.Tetra, name: 'Tetra: win ≥ 2× bet', condition: result => win(result) >= 2 * bet(result) },
    { roundType: RoundType.Coins, name: 'Coins: win credits (then gamble or take)', condition: result => credits(result) > 0 },
    { roundType: RoundType.Coins, name: 'Coins: no win', condition: result => win(result) === 0 },
    { roundType: RoundType.Gamble, name: 'Gamble: win', condition: result => credits(result) > 0 },
    { roundType: RoundType.Gamble, name: 'Gamble: lose', condition: result => credits(result) === 0 },
  ];
  return all.filter(preset => live.roundTypes.includes(preset.roundType) && (preset.requires === undefined || live.roundTypes.includes(preset.requires)));
});

function refreshLive() {
  const k = kernel();
  const flow = gameflow();
  if (!k || !flow) return;
  live.credit = k.GetCredit();
  live.capping = k.GetCapping();
  live.setupCapping = k.GetConfiguredCapping();
  live.buttons = k.GetButtonStates();
  const mathRules = app?.runtime.TryGet(IMathRules);
  const roundTypes = [...mathRules?.GetAvailableRoundTypes() ?? []];
  // the hold and spin round's rules are by the round that triggers it, not among the available round types
  if (mathRules?.HasHoldAndSpinRules(RoundType.Main)) roundTypes.push(RoundType.HoldAndSpin);
  if (roundTypes.join() !== live.roundTypes.join()) live.roundTypes = [...roundTypes];
  const fsm = app?.GetGameModule<GameFsm>('Fsm')?.GetMachine();
  live.states = fsm?.ActiveStates() ?? [];
  const transitions = fsm?.transitions ?? [];
  live.transitions = transitions.slice(-50).reverse().map(item => TransitionRowOf(item, transitions[0].time));
  live.match = flow.GetMatchSnapshot();
  live.preset = flow.GetRoundPreset()?.name ?? '';
  live.history = flow.history.slice(-8).reverse().map(item => ({ roundType: RoundType[item.roundType], bet: item.bet, win: item.win }));
  const pages = app?.GetGameModule<InfoViewPages>('InfoView')?.GetInfoView()?.GetPages();
  live.infoPage = pages ? EInfoViewPageType[pages.current] : '';
  const images = app?.Get(VideoManager)?.TryGetImages();
  live.images = images ? `${images.loadedCount} / ${images.size}` : '';
  toolsTick.value++;
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
  // the game server of the workspace's game, which deals the rounds' numbers and keeps the RNG Queue
  const server = new GameServer((path, method, body) => api(path, method, body), project.value.workspace.id);
  server.onError = message => {
    serverError.value = message;
  };
  try {
    await app.Start({
      canvas: canvas.value, infoCanvas: infoCanvas.value, topperCanvas: topperCanvas.value, project: project.value, report: report.value,
      kernel: { minBet: 0, onExit: exitGame }, server,
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
  serverError.value = '';
  // what the page showed of the game that ended (the page is kept, so it is not made anew for the next game)
  Object.assign(live, { states: [], transitions: [], match: null, preset: '', history: [], infoPage: '', images: '' });
  toolsTick.value++;
}

/** The game's Exit button (the application control's ExitGracefully): back to the asset library, which ends the game. */
function exitGame() {
  exited = true;
  navigate('library');
}

async function load() {
  needsLoad = false;
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

/** A screenshot's size, whatever the size the page shows the game at. */
const SCREENSHOT = { width: 1920, height: 1080 };
let screenshotTaking = false;

/** The C++ ScreenshotsManager's screenshot of the main viewport (Ctrl+S): the game screen alone, its canvas, at
 * 1920x1080, saved to the app data folder's screenshots (outside the repository) and copied to the clipboard. */
async function takeScreenshot() {
  const screen = canvas.value;
  if (state.value !== 'running' || !screen || !project.value || screenshotTaking) return;
  screenshotTaking = true;
  try {
    const shot = document.createElement('canvas');
    shot.width = SCREENSHOT.width;
    shot.height = SCREENSHOT.height;
    const ctx = shot.getContext('2d');
    if (!ctx) throw new Error('the browser could not draw the game screen');
    // over black, as C++ clears the screenshot's frame buffer
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, shot.width, shot.height);
    ctx.drawImage(screen, 0, 0, shot.width, shot.height);
    const png = new Promise<Blob>((resolve, reject) => shot.toBlob(blob => (blob ? resolve(blob) : reject(new Error('the browser could not make the PNG image'))), 'image/png'));
    // Copied at once, while the click or the key press still lets the page write the clipboard: '' or why not.
    const copied = copyImage(png).then(() => '', (failure: Error) => failure.message || String(failure));
    const image = await blobBase64(await png);
    const saved = await api<{ file: string }>(`game/screenshot?workspace=${encodeURIComponent(project.value.workspace.id)}`, 'POST', { image })
      .then(result => ({ file: result.file, error: '' }), (failure: Error) => ({ file: '', error: failure.message }));
    const notCopied = await copied;
    if (saved.file && !notCopied) notify(`Screenshot taken: saved to ${saved.file} and copied to the clipboard.`);
    else if (saved.file) notify(`Screenshot saved to ${saved.file}, but not copied to the clipboard: ${notCopied}`, true);
    else if (!notCopied) notify(`Screenshot copied to the clipboard, but not saved: ${saved.error}`, true);
    else notify(`The screenshot was not saved (${saved.error}) or copied to the clipboard (${notCopied}).`, true);
  } catch (failure) {
    notify(`The screenshot was not taken: ${(failure as Error).message}`, true);
  } finally {
    screenshotTaking = false;
  }
}

/** Copies a PNG image to the system clipboard. Its write starts before the image is made (an image to come), so that
 * the browser still counts it as the user's action. */
async function copyImage(png: Promise<Blob>) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') throw new Error('this browser cannot copy images');
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

function blobBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).slice(String(reader.result).indexOf(',') + 1));
    reader.onerror = () => reject(reader.error ?? new Error('the browser could not read the PNG image'));
    reader.readAsDataURL(blob);
  });
}

function onKeydown(event: KeyboardEvent) {
  if (state.value !== 'running' || event.metaKey || event.altKey) return;
  // On the game's page the keys are the cabinet's: Space is START even when a button has the focus.
  const target = event.target as HTMLElement;
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable) return;
  if (event.ctrlKey) {
    // a screenshot (C++'s Ctrl+S, the Screenshots window), by the key's place whatever the keyboard layout
    if (event.code === 'KeyS' && !event.shiftKey) {
      event.preventDefault();
      void takeScreenshot();
      return;
    }
    // the debug tools' shortcuts (C++'s imguiShortcuts: Ctrl+A, the Automation window)
    const shortcut = app?.Get(DebugImguiOverlay)?.GetShortcuts().Find(event);
    if (!shortcut) return;
    event.preventDefault();
    shortcut.action();
    toolsTick.value++;
    if (app?.Get(AutomationManager)?.m_imguiWindowOpen.value) navigate('gameTools');
    return;
  }
  if (props.toolsPage) return;
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
  const fsm = app?.GetGameModule<GameFsm>('Fsm')?.GetMachine();
  const viewModule = app?.GetGameModule<ViewModule>('View');
  const gameName = app?.GetGameName();
  if (!fsm || !viewModule || !gameName || !project.value) return;
  try {
    const plugin = MODULES[`${gameName}Fsm`]?.plugin ?? project.value.workspace.id;
    const exported = await ExportPlugin({ gameName, plugin, project: project.value, fsm: fsm.root, viewGroups: viewModule.GetViewGroups(),
      math: app?.GetGameModule<{ GetMathExport?(): Omit<MathExportInput, 'gameName'> }>('Math')?.GetMathExport?.() }, session.token, { translateAllViews: exportAllViews.value });
    exportReport.value = exported.report;
    exportResult.value = await GameBackend.Export(gameName, exported.files, session.token, exported.copies);
    notify(`Exported ${exportResult.value.files.length} files to ${exportResult.value.folder}`);
  } catch (failure) {
    notify(`Export failed: ${(failure as Error).message}`, true);
  }
}

async function checkCppChanges() {
  importChecking.value = true;
  try {
    importReport.value = await api<ImportReport>('game/import', 'GET');
  } catch (failure) {
    notify(`Comparing the C++ failed: ${(failure as Error).message}`, true);
  } finally {
    importChecking.value = false;
  }
}

async function followAgent() {
  window.clearTimeout(importTimer);
  try {
    importStatus.value = await api<ImportStatus>('game/agent/status', 'GET');
  } catch (failure) {
    notify(`The agent's status failed: ${(failure as Error).message}`, true);
    return;
  }
  if (importStatus.value.running) {
    importTimer = window.setTimeout(followAgent, 2000);
    return;
  }
  const result = importStatus.value.result;
  const what = importStatus.value.kind === 'export' ? 'into the export\'s C++' : 'from the C++';
  if (importStatus.value.kind === 'game-sync') {
    if (result) notify('The game sync has finished: its report is in the Developer panel');
    else if (importStatus.value.error) notify(importStatus.value.error, true);
    void checkCppChanges();
    return;
  }
  if (result && importStatus.value.kind === 'import-game') {
    notify(`Imported ${result.gameName}: ${result.copied?.length ?? 0} files copied, ${result.ported.length} ported${result.failed.length ? `, ${result.failed.length} not` : ''}; ${result.left?.length ?? 0} left`, !!result.failed.length);
  } else if (result) notify(`Ported ${what}: ${result.ported.length} files${result.failed.length ? `, ${result.failed.length} not` : ''}`, !!result.failed.length);
  else if (importStatus.value.error) notify(importStatus.value.error, true);
  if (importStatus.value.kind === 'import') void checkCppChanges();
  if (importStatus.value.kind === 'import-game') void checkGameImport();
}

/** The workspace's C++ game (games/game/alpha_family/plugins/<workspace id>): how it imports into the browser game. */
async function checkGameImport() {
  gameImportChecking.value = true;
  try {
    const imports = await api<GameImports>('game/import-game', 'GET');
    const game = imports.games.find(item => item.plugin === imports.workspace);
    gameImport.value = game ? await api<GameImportReport>(`game/import-game?plugin=${encodeURIComponent(game.plugin)}`, 'GET') : null;
    if (!game) notify(`The C++ game sources have no alpha_family/plugins/${imports.workspace}`, true);
  } catch (failure) {
    notify(`Comparing the C++ game failed: ${(failure as Error).message}`, true);
  } finally {
    gameImportChecking.value = false;
  }
}

/** Imports the workspace's C++ game: its copies only, or all its files with Claude Code. */
async function importGame(copiesOnly: boolean) {
  if (!gameImport.value) return;
  try {
    importStatus.value = await api<ImportStatus>('game/import-game', 'POST', { plugin: gameImport.value.plugin, copiesOnly });
    void followAgent();
  } catch (failure) {
    notify(`Importing the game failed: ${(failure as Error).message}`, true);
  }
}

const gameImportCounts = computed(() => {
  const units = gameImport.value?.units ?? [];
  return { done: units.filter(unit => unit.mode === 'done').length, copy: units.filter(unit => unit.mode === 'copy').length,
    port: units.filter(unit => unit.mode === 'diff' || unit.mode === 'port').length, total: units.length };
});

/** Runs /game-sync for the workspace's game in a headless Claude Code session, as in a terminal: it syncs the shared
 * libraries and the game, checks and plays them, and reports, without committing. */
async function syncGame() {
  try {
    importStatus.value = await api<ImportStatus>('game/sync', 'POST');
    void followAgent();
  } catch (failure) {
    notify(`The game sync failed: ${(failure as Error).message}`, true);
  }
}

/** Has a Claude Code agent port one file's C++ changes into the TypeScript, in a copy of it. */
async function portCppChanges(ts?: string) {
  try {
    importStatus.value = await api<ImportStatus>('game/import', 'POST', { files: ts ? [ts] : [] });
    void followAgent();
  } catch (failure) {
    notify(`Porting the C++ changes failed: ${(failure as Error).message}`, true);
  }
}

/** Has a Claude Code agent port into the export's C++ the TypeScript changes the translator could not translate. */
async function portExportChanges() {
  if (!exportResult.value) return;
  try {
    importStatus.value = await api<ImportStatus>('game/export-agent', 'POST', { id: exportResult.value.id });
    void followAgent();
  } catch (failure) {
    notify(`Porting the export's changes failed: ${(failure as Error).message}`, true);
  }
}

watch(() => config.value?.defaultWorkspace, (workspace, previous) => {
  if (previous === undefined || workspace === previous) return;
  // another workspace's game: now, or when the page shows again
  if (shown) {
    void load();
  } else {
    stop();
    needsLoad = true;
  }
});

/** The page shows: the keys are the game's again, and a game that is not playing starts. */
function show() {
  if (shown) return;
  shown = true;
  window.addEventListener('keydown', onKeydown);
  if (needsLoad || state.value === 'error' || state.value === 'unsupported') void load();
}

/** Another page shows: the game plays on, unless its Exit button ended it. */
function hide() {
  if (!shown) return;
  shown = false;
  window.removeEventListener('keydown', onKeydown);
  if (exited) {
    exited = false;
    stop();
    needsLoad = true;
  }
}

onMounted(show);
onActivated(show);
onDeactivated(hide);
onBeforeUnmount(() => window.clearTimeout(importTimer));
onBeforeUnmount(() => {
  hide();
  stop();
});
</script>

<template>
  <PageHeader :title="toolsPage ? 'Tools' : project ? `Play ${project.workspace.name}` : 'Play'">
    <template #links>
      <li><span>{{ toolsPage ? 'RNG tools and automation for the current game' : "The game in the browser, from the asset library’s resources" }}</span></li>
    </template>
    <template #links-right>
      <li v-if="state === 'running' && !toolsPage"><span>Credit {{ formatCredit(live.credit) }}</span></li>
    </template>
  </PageHeader>

  <div v-if="state === 'loading'" class="card"><div class="card-body text-muted"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Loading the game project…</div></div>
  <div v-else-if="state === 'unsupported'" class="card">
    <div class="card-body">
      <h5 class="card-title">This game cannot be played in the browser yet</h5>
      <p class="mb-2">The browser game has none of the game modules this workspace's modules config
        <code v-if="project?.modules">{{ project.modules.file }}</code><span v-else>(configs/{{ project?.workspace.id }}/modules)</span> names:</p>
      <ul class="mb-0"><li v-for="module in project?.modules?.config.modules ?? []" :key="module.name"><code>{{ module.name }}</code></li></ul>
      <h6 class="mt-3">Import from C++</h6>
      <p class="small mb-2">The game's C++ folder (<code>games/game/alpha_family/plugins/{{ project?.workspace.id }}</code>) imports into the
        browser game file by file: a file whose C++ is a ported game's is copied from its TypeScript, the others are ported by Claude Code.
        What does not type-check is left out; import again to go on.</p>
      <div class="btn-group btn-group-sm mb-2" role="group">
        <button type="button" class="btn btn-outline-primary" :disabled="gameImportChecking || importStatus?.running" @click="checkGameImport"><i class="mdi mdi-source-branch-sync" aria-hidden="true" /> Check the C++</button>
        <button type="button" class="btn btn-outline-primary" :disabled="!gameImportCounts.copy || importStatus?.running" @click="importGame(true)"><i class="mdi mdi-content-copy" aria-hidden="true" /> Copy the same files</button>
        <button type="button" class="btn btn-outline-primary" :disabled="!gameImport || gameImportCounts.done === gameImportCounts.total || importStatus?.running" @click="importGame(false)"><i class="mdi mdi-robot-outline" aria-hidden="true" /> Import with Claude Code</button>
      </div>
      <p v-if="gameImport" class="small mb-1">{{ gameImport.gameName }}: {{ gameImportCounts.total }} files, {{ gameImportCounts.done }} imported;
        {{ gameImportCounts.copy }} the same as {{ gameImport.template?.gameName ?? 'a ported game' }}'s, {{ gameImportCounts.port }} to port.</p>
      <p v-if="importStatus?.running" class="small mb-1"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> {{ importStatus.log[importStatus.log.length - 1] ?? 'Starting…' }}</p>
      <template v-else-if="importStatus?.kind === 'import-game' && importStatus.result">
        <p v-for="item in importStatus.result.failed" :key="`failed:${item.ts}`" class="small text-danger mb-1" :title="item.account">Not imported <code>{{ item.ts.split('/').pop() }}</code>: {{ item.reason?.split('\n')[0] }}</p>
        <button v-if="!importStatus.result.left?.length" type="button" class="btn btn-primary btn-sm" @click="load"><i class="mdi mdi-play" aria-hidden="true" /> Play</button>
      </template>
    </div>
  </div>
  <div v-else-if="state === 'error'" class="alert alert-danger" role="alert">
    <strong>The game stopped:</strong> {{ error }}
    <button type="button" class="btn btn-outline-danger btn-sm ml-2" @click="load">Restart</button>
  </div>

  <div v-show="toolsPage">
    <GameToolsPanel v-if="state === 'running' && app" :app="app" :tick="toolsTick" @changed="toolsTick++" />
  </div>
  <p v-if="toolsPage && state === 'starting'" class="text-muted"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Loading the game’s tools…</p>

  <div v-show="!toolsPage && (state === 'starting' || state === 'running')" class="game-page">
    <div class="card game-card">
      <div class="card-body p-0">
        <div ref="stage" class="game-stage">
          <canvas ref="canvas" class="game-canvas" aria-label="Game screen" />
          <div v-if="state === 'starting'" class="game-overlay"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> Loading the game's data…</div>
        </div>
        <div class="game-panel">
          <div class="game-panel-row" role="group" aria-label="Game session controls">
            <button v-for="button in sessionButtons" :key="button.name" type="button" :class="['btn', button.name === 'Start' ? 'btn-success' : 'btn-outline-secondary', 'btn-sm']"
              :disabled="!live.buttons[button.name]?.enabled" :title="`${button.label} (${button.key})`" @click="press(button.name)">
              <i :class="['mdi', button.icon]" aria-hidden="true" /> {{ button.label }}
            </button>
            <button type="button" class="btn btn-outline-primary btn-sm" title="Insert credit" @click="cashIn(1000)">+10.00</button>
            <button type="button" class="btn btn-outline-primary btn-sm" title="Insert credit" @click="cashIn(10000)">+100.00</button>
            <button type="button" class="btn btn-outline-secondary btn-sm" title="Full screen" aria-label="Full screen" @click="fullscreen"><i class="mdi mdi-fullscreen" aria-hidden="true" /></button>
            <button type="button" class="btn btn-outline-secondary btn-sm" title="Screenshot of the game screen, saved and copied to the clipboard (Ctrl+S)" aria-label="Take a screenshot"
              :disabled="state !== 'running'" @click="takeScreenshot"><i class="mdi mdi-camera-outline" aria-hidden="true" /></button>
          </div>
          <div class="game-panel-row" role="group" aria-label="Game cabinet buttons">
            <button v-for="button in cabinetButtons" :key="button.name" type="button" class="btn btn-outline-secondary btn-sm"
              :disabled="!live.buttons[button.name]?.enabled" :title="`${button.label} (${button.key})`" @click="press(button.name)">
              <i :class="['mdi', button.icon]" aria-hidden="true" /> {{ button.label }}
            </button>
          </div>
          <div class="game-panel-row game-panel-sections" role="group" aria-label="Game sections">
            <button type="button" class="btn btn-sm" :class="infoOpen ? 'btn-primary' : 'btn-outline-secondary'" :aria-expanded="infoOpen" title="The cabinet's info screen, with the help pages" @click="infoOpen = !infoOpen"><i class="mdi mdi-monitor" aria-hidden="true" /> Info screen</button>
            <button type="button" class="btn btn-sm" :class="topperOpen ? 'btn-primary' : 'btn-outline-secondary'" :aria-expanded="topperOpen" title="The cabinet's topper screen" @click="topperOpen = !topperOpen"><i class="mdi mdi-monitor-shimmer" aria-hidden="true" /> Topper screen</button>
            <button type="button" class="btn btn-sm" :class="statsOpen ? 'btn-primary' : 'btn-outline-secondary'" :aria-expanded="statsOpen" aria-controls="game-stats" @click="statsOpen = !statsOpen"><i class="mdi mdi-chart-box-outline" aria-hidden="true" /> Game stats</button>
            <button type="button" class="btn btn-sm" :class="devOpen ? 'btn-primary' : 'btn-outline-secondary'" :aria-expanded="devOpen" aria-controls="game-developer" @click="devOpen = !devOpen"><i class="mdi mdi-code-tags" aria-hidden="true" /> Developer</button>
            <GameClock v-if="automation" class="game-panel-clock" slider-only :manager="automation" :tick="toolsTick" @changed="toolsTick++" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="serverError" class="alert alert-warning mb-0" role="alert">
      <i class="mdi mdi-lan-disconnect" aria-hidden="true" /> The game server does not answer, so the game waits for its rounds' numbers: {{ serverError }}
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

    <section v-if="statsOpen" id="game-stats" class="card game-dev" aria-labelledby="game-stats-title">
      <div class="card-body">
        <h4 id="game-stats-title" class="card-title">Game stats</h4>
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
              <button type="button" class="btn btn-sm btn-outline-secondary" :disabled="!live.preset" @click="setPreset(null)">Random (the game server's numbers)</button>
            </div>
            <h6>Maximum award</h6>
            <div class="btn-group btn-group-sm w-100 mb-2" role="group" aria-label="Maximum award">
              <button type="button" :class="['btn', live.capping === live.setupCapping ? 'btn-primary' : 'btn-outline-primary']" @click="setCapping(live.setupCapping)">The setup's ({{ formatCredit(live.setupCapping) }})</button>
              <button type="button" :class="['btn', live.capping === TEST_CAPPING ? 'btn-primary' : 'btn-outline-primary']" @click="setCapping(TEST_CAPPING)">{{ formatCredit(TEST_CAPPING) }}, to test it</button>
            </div>
          </div>
        </div>
        <h6 class="mt-3">Resources <small class="text-muted">images loaded {{ live.images }}<span v-if="!report">, no asset report ({{ reportError || 'none yet' }}): every declared file is used</span></small></h6>
        <p v-if="!problems.length" class="text-muted small mb-0">Every resource the game used so far is in the asset report.</p>
        <ul v-else class="game-dev-list small"><li v-for="(problem, index) in problems" :key="index"><strong>{{ problem.kind }}</strong> {{ problem.id }}: {{ problem.message }}</li></ul>
      </div>
    </section>

    <section v-if="devOpen" id="game-developer" class="card game-dev game-developer" aria-labelledby="game-developer-title">
      <div class="card-body">
        <h4 id="game-developer-title" class="card-title">Developer</h4>
        <section aria-labelledby="game-import-title">
          <div class="game-code-heading">
            <div>
              <h5 id="game-import-title">Import from C++</h5>
              <p class="small text-muted mb-0">Compare the C++ sources with their TypeScript ports. Port with Claude Code runs <code>/game-sync {{ project?.workspace.id }}</code> as in a terminal: it syncs the shared libraries and this game, checks and plays them, and reports, without committing. Port file has an agent port one file in a copy of the TypeScript, and keeps what type-checks and matches the updated C++.</p>
            </div>
            <div class="game-code-actions">
              <button type="button" class="btn btn-outline-primary btn-sm" :disabled="importChecking || importStatus?.running" @click="checkCppChanges"><i class="mdi mdi-source-branch-sync" aria-hidden="true" /> {{ importChecking ? 'Checking…' : 'Check the C++' }}</button>
              <button type="button" class="btn btn-primary btn-sm" :disabled="!importReport?.changed.length || importChecking || importStatus?.running" :title="`Runs /game-sync ${project?.workspace.id ?? ''} with Claude Code`" @click="syncGame"><i class="mdi mdi-robot-outline" aria-hidden="true" /> Port with Claude Code</button>
            </div>
          </div>
          <p v-if="!importReport" class="game-code-empty text-muted small">Check the C++ to see which files have changes to import.</p>
          <template v-else>
            <p v-if="!importReport.changed.length" class="game-code-empty text-muted small">The TypeScript ports the C++ as it is. No changes to import.</p>
            <template v-else>
              <p class="game-import-summary small"><strong>{{ importReport.changed.length }} {{ importReport.changed.length === 1 ? 'file' : 'files' }} to import</strong></p>
              <div class="table-responsive game-import-files">
                <table class="table game-import-table">
                  <caption class="sr-only">C++ changes to import into TypeScript</caption>
                  <colgroup><col class="game-import-target"><col class="game-import-sources"><col class="game-import-changes"><col class="game-import-action"></colgroup>
                  <thead><tr><th scope="col">TypeScript file</th><th scope="col">C++ sources</th><th scope="col">Changes</th><th scope="col">Action</th></tr></thead>
                  <tbody>
                    <tr v-for="change in importReport.changed" :key="change.ts">
                      <td><strong>{{ change.ts.split('/').pop() }}</strong><code class="game-code-path">{{ change.ts }}</code></td>
                      <td><ul class="game-code-files"><li v-for="file in change.cpp" :key="file"><code>{{ file }}</code></li></ul></td>
                      <td>
                        <span v-if="change.uncommitted" class="badge badge-warning mb-2">Uncommitted C++</span>
                        <details v-if="change.commits.length" class="game-import-history">
                          <summary>{{ change.commits.length }} {{ change.commits.length === 1 ? 'commit' : 'commits' }}</summary>
                          <ul class="game-import-commits"><li v-for="commit in change.commits" :key="commit">{{ commit }}</li></ul>
                        </details>
                        <span v-else-if="!change.uncommitted" class="text-muted">Source changes</span>
                      </td>
                      <td><button type="button" class="btn btn-outline-primary btn-sm" :disabled="importChecking || importStatus?.running" :aria-label="`Port ${change.ts}`" @click="portCppChanges(change.ts)">Port file</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </template>
        </section>

        <section class="game-code-export" aria-labelledby="game-export-title">
          <h5 id="game-export-title">Export to C++</h5>
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
            <button v-if="exportResult && exportReport.changed.length" type="button" class="btn btn-sm btn-outline-primary mt-1" :disabled="importStatus?.running" title="A Claude Code agent ports them into the export's C++; the export keeps what compiles" @click="portExportChanges"><i class="mdi mdi-robot-outline" aria-hidden="true" /> Port them with Claude Code</button>
          </template>
        </section>

        <section v-if="importStatus" class="game-code-status" aria-label="Code transfer status">
          <p v-if="importStatus.running" class="small mb-0" role="status"><i class="mdi mdi-loading mdi-spin" aria-hidden="true" /> {{ importStatus.log[importStatus.log.length - 1] ?? 'Starting Claude Code…' }}</p>
          <p v-else-if="importStatus.error" class="alert alert-danger mb-0" role="alert">{{ importStatus.error }}</p>
          <div v-else-if="importStatus.kind === 'game-sync' && importStatus.result" class="game-sync-report small">
            <p class="text-muted mb-2">The game sync's report<template v-if="importStatus.result.cost != null"> ({{ importStatus.result.turns }} turns, ${{ importStatus.result.cost.toFixed(2) }})</template>. Review its changes with <code>git diff</code>, and commit them before the next export.</p>
            <div class="game-sync-report-text">{{ importStatus.result.report }}</div>
          </div>
          <ul v-else-if="importStatus.result" class="game-code-results small">
            <li v-for="item in importStatus.result.ported" :key="`ported:${item.ts}`" :title="item.account"><span class="badge badge-success">Ported</span><div><code>{{ item.ts }}</code><span>{{ importStatus.kind === 'export' ? "Updated the export's C++" : `${item.files?.length ?? 0} files changed` }}</span></div></li>
            <li v-for="item in importStatus.result.upToDate ?? []" :key="`up:${item.ts}`" :title="item.account"><span class="badge badge-light">Up to date</span><div><code>{{ item.ts }}</code><span>Ports the change already</span></div></li>
            <li v-for="item in importStatus.result.failed" :key="`failed:${item.ts}`" :title="item.account"><span class="badge badge-danger">Not ported</span><div><code>{{ item.ts }}</code><span>{{ item.reason?.split('\n')[0] }}</span></div></li>
          </ul>
        </section>
      </div>
    </section>
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
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}

.game-panel-row {
  display: flex;
  flex: 0 0 auto;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem;
  max-width: 100%;
}

.game-panel-sections {
  flex-basis: 100%;
  padding-top: 0.75rem;
  border-top: 1px solid #ebedf2;
}

.game-panel-clock {
  margin-left: auto;
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

.game-import-commits {
  margin: 0.5rem 0 0;
  padding-left: 1rem;
  color: #6c757d;
}

.game-code-heading {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-start;
  gap: 1rem;

  > div:first-child {
    flex: 1 1 420px;
  }
}

.game-code-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.game-code-empty {
  margin: 1rem 0 0;
  padding: 1rem;
  border: 1px dashed #dce1ea;
  border-radius: 6px;
}

.game-import-summary {
  margin: 1rem 0 0.5rem;
}

.game-import-files {
  max-height: 480px;
  border: 1px solid #ebedf2;
  border-radius: 6px;
}

.game-import-table {
  table-layout: fixed;
  min-width: 720px;
  margin: 0;

  .game-import-target { width: 30%; }
  .game-import-sources { width: 32%; }
  .game-import-changes { width: 24%; }
  .game-import-action { width: 14%; }

  th, td {
    height: auto;
    padding: 0.85rem;
    vertical-align: top;
    white-space: normal;
    overflow-wrap: anywhere;
    font-size: 0.8rem;
    line-height: 1.5;
  }

  th {
    position: sticky;
    top: 0;
    z-index: 1;
    border-top: 0;
    background: #f8f9fc;
  }

  code {
    display: block;
    white-space: normal;
    overflow-wrap: anywhere;
    color: #6c757d;
    font-size: 0.75rem;
  }

  .btn {
    white-space: nowrap;
  }
}

.game-code-path {
  display: block;
  margin-top: 0.35rem;
  color: #6c757d;
}

.game-code-files {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 0.5rem;
  padding: 0;
  margin: 0;
  list-style: none;
}

.game-import-history summary {
  cursor: pointer;
  color: #2277cf;
}

.game-code-export,
.game-code-status {
  margin-top: 1.5rem;
  padding-top: 1.5rem;
  border-top: 1px solid #ebedf2;
}

.game-sync-report-text {
  white-space: pre-wrap;
  overflow-wrap: anywhere;
  max-height: 32rem;
  overflow-y: auto;
}

.game-code-results {
  display: grid;
  gap: 0.75rem;
  list-style: none;
  padding: 0;
  margin: 0;

  li {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
  }

  li > div {
    min-width: 0;
    overflow-wrap: anywhere;
  }

  code, li > div > span {
    display: block;
  }

  code {
    overflow-wrap: anywhere;
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
