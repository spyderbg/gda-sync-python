// Egt::Integration::AutomationManager (integration/plugins/src/Egt/AutomationManager, a module of the QA builds): the
// Automation window, Tools → Automation (Ctrl+A). It records every game played (its bet, win, and each round's RNG
// numbers), so that any game can be replayed or exported; it plays games on its own: generated (with a seed, or the
// kernel's numbers), one recorded game replayed, or all of them; and it sets the game clock's speed and pause. While it
// plays, it loads the automation's view module (its stubViewModule: AlphaFamilyAutomationView), whose stubs make the
// views finish at once (Instant) and press the buttons (Instant, Auto Input).
//
// The Play page draws its window in Vue (debug/AutomationWindow.vue). The C++ imports and exports games through file
// dialogs; the browser's window reads an import from a file the user picks and saves an export as a download (the
// texts below). The C++'s auto export (autoExportGamesCount, appending to a path) has no browser counterpart.

import { IDebugOverlay, type MainMenuBar, type Shortcuts } from '@game/engine/Game/RuntimeExport/IDebugOverlay';
import { IDebugAutomation, IDebugAutomationEvents } from '@game/engine/Game/RuntimeExport/IDebugAutomation';
import { IModuleManager } from '@game/engine/Game/RuntimeExport/IModuleManager';
import type { GameRoundType } from '@game/engine/Game/Math/Common.data';
import { Clock } from '@game/engine/Game/Utils/Clock';
import { HistoryEngine, type IRng, MonteCarloEngineHat, ReplayEngine, RngOp, type RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { SBool } from '@game/engine/ImGuiEx/Extensions/Utils';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { AutomationMode, IAutomationManager, IAutomationManagerEvents } from '@game/integration/Runtime/IAutomationManager';
import { IGameflowIntegration } from '@game/integration/Runtime/IGameflowIntegration';
import { IPauseControl, PauseReason } from '@game/integration/Runtime/IPauseControl';

export const SeedModeLabels = ["Don't seed", 'Seed Once', 'Seed Incremental'];
export const ViewModeLabels = ['Instant', 'Auto Input', 'Manual Input'];
export const StrategyLabels = ['Default', 'Wheel'];

export const MaxGenerateCount = 1_000_000;

type GenerateEngine = HistoryEngine<MonteCarloEngineHat>;
type ReplayHistoryEngine = HistoryEngine<ReplayEngine>;

export interface StubViewModule {
  name: string;
  space: string;
  header: string;
}

/** Egt::Integration::AutomationManagerConfig (AutomationManager.data.h). */
export class AutomationManagerConfig {
  stubViewModule: StubViewModule = { name: '', space: '', header: '' };
  autoExportGamesCount = 0;
  autoExportGamesPath = '';
  gameloaderMaxGameNameLength = 17;

  DeserializeFrom(config: ModuleConfig) {
    const stubViewModule = config.stubViewModule as Partial<StubViewModule> | undefined;
    if (stubViewModule) this.stubViewModule = { name: stubViewModule.name ?? '', space: stubViewModule.space ?? '', header: stubViewModule.header ?? '' };
    if (typeof config.autoExportGamesCount === 'number') this.autoExportGamesCount = config.autoExportGamesCount;
    if (typeof config.autoExportGamesPath === 'string') this.autoExportGamesPath = config.autoExportGamesPath;
    if (typeof config.gameloaderMaxGameNameLength === 'number') this.gameloaderMaxGameNameLength = config.gameloaderMaxGameNameLength;
  }
}

export interface GameData {
  game: number;
  bet: number;
  win: number;
  seed: number;
  rng: RngSequence;
  roundRngCounts: number[];
  label: string;
}

export enum SeedMode {
  None,
  Once,
  Incremental,
}

export enum ViewMode {
  Instant,
  AutoInput,
  ManualInput,
}

export enum StrategyMode {
  Default,
  Wheel,
}

function NewGameData(): GameData {
  return { game: 0, bet: 0, win: 0, seed: 0, rng: { data: [] }, roundRngCounts: [], label: '' };
}

function FormatRoundRngCounts(counts: number[]) {
  let text = '';
  for (const count of counts) {
    text += text ? '|' : '';
    text += String(count);
  }
  return text;
}

function LoadRoundRngCounts(text: string) {
  const counts: number[] = [];
  for (const s of text.split('|')) {
    const count = Number.parseInt(s, 10);
    if (Number.isFinite(count) && /^\d+$/.test(s.trim())) {
      counts.push(count);
    } else {
      console.assert(false, 'Failed to parse round RNG counts');
      counts.push(0);
    }
  }
  return counts;
}

/** GameCore::FormatRngSequence(sequence, RngSequenceFmt::OpRangeNum): op:range:num|op:range:num|... */
export function FormatRngSequence(sequence: RngSequence) {
  return sequence.data.map(n => `${n.op}:${n.range}:${n.value}`).join('|');
}

/** GameCore::LoadRngSequence(text, RngSequenceFmt::OpRangeNum) */
export function LoadRngSequence(text: string): RngSequence {
  const sequence: RngSequence = { data: [] };
  for (const s of text.split('|')) {
    if (!s) continue;
    const s3 = s.split(':'); // Op:Range:Rng
    sequence.data.push({ op: Number.parseInt(s3[0], 10) as RngOp, range: Number(s3[1]) >>> 0, value: Number(s3[2]) >>> 0 });
  }
  return sequence;
}

function RoundUpToMultiple(value: number, multiple: number) {
  return Math.ceil(value / multiple) * multiple;
}

/** RngDistributionHat::InverseUniform: the 32 random bits a number of a range was drawn from. */
function InverseUniform(value: number, range: number) {
  /// Inverse the algorithm in GenerateUniform
  const UINT32 = 0x1_0000_0000n;
  if ((range & (range - 1)) === 0) {
    return range ? Number(((BigInt(value) << 32n) / BigInt(range)) & 0xffffffffn) : value >>> 0;
  }
  const bias = (UINT32 - BigInt(range)) % BigInt(range);
  const acceptable = (UINT32 - bias) % UINT32;
  console.assert(acceptable > 0n);
  return Number(((BigInt(value) * acceptable) / BigInt(range)) & 0xffffffffn);
}

/** A CSV row's fields (the C++'s csv parser: commas, double quotes). */
function ParseCsvRows(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') {
        quoted = false;
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      row.push(field);
      if (row.some(value => value !== '')) rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  row.push(field);
  if (row.some(value => value !== '')) rows.push(row);
  return rows;
}

function CsvField(value: string | number) {
  const text = String(value);
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function XmlAttribute(value: string) {
  return value.replaceAll('&', '&amp;').replaceAll('"', '&quot;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export class AutomationManager extends BaseModule implements IAutomationManager, IDebugAutomation {
  private readonly m_automationEvents = new IAutomationManagerEvents();
  private readonly m_debugAutomationEvents = new IDebugAutomationEvents();

  private readonly m_config = new AutomationManagerConfig();
  m_mode = AutomationMode.Disabled;
  private m_games: GameData[] = [];
  private m_autoGameCounter = 0;
  m_gameInProgress: GameData | null = null;
  private m_engine: GenerateEngine | ReplayHistoryEngine | null = null;
  readonly m_imguiWindowOpen = new SBool('Automation_open');
  m_viewMode = ViewMode.Instant;
  m_generateSeed = 1;
  m_generateCount = 10;
  m_generateSeedMode = SeedMode.Incremental;
  m_strategyMode = StrategyMode.Default;
  m_replayGame = 1;
  private m_nextGameNumber = 1;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    this.m_config.DeserializeFrom(config);

    this.RuntimeAdd(IAutomationManager, this);
    this.RuntimeAdd(IAutomationManager.Events, this.m_automationEvents);

    this.RuntimeAdd(IDebugAutomation, this);
    this.RuntimeAdd(IDebugAutomation.Events, this.m_debugAutomationEvents);

    const debugOverlay = this.RuntimeTryGetConst(IDebugOverlay.Events);
    if (debugOverlay) {
      debugOverlay.imguiMainMenuBar.RegisterInstant(this, menuBar => this.OnImGuiMainMenuBar(menuBar));
      debugOverlay.imguiShortcuts.RegisterInstant(this, shortcuts => this.OnImGuiShortcuts(shortcuts));
    }

    if (!this.RuntimeGetConst(IGameflowIntegration).IsIdle()) {
      this.m_gameInProgress = NewGameData(); // disable generate until current game completes - todo:
    }

    this.m_imguiWindowOpen.Load();

    return true;
  }

  PostInit() {
    if (!super.PostInit()) return false;

    const gameflowEvents = this.RuntimeGetConst(IGameflowIntegration.Events);
    gameflowEvents.matchStarted.RegisterInstant(this, creditBet => this.OnGameflowMatchStarted(creditBet));
    gameflowEvents.matchCanceled.RegisterInstant(this, creditBet => this.OnGameflowMatchCanceled(creditBet));
    gameflowEvents.roundStarting.RegisterInstant(this, roundType => this.OnGameflowRoundStarting(roundType));
    gameflowEvents.roundStarted.RegisterInstant(this, roundType => this.OnGameflowRoundStarted(roundType));
    gameflowEvents.matchEnded.RegisterInstant(this, creditWin => this.OnGameflowMatchEnded(creditWin));

    return true;
  }

  Deinit() {
    const debugOverlay = this.RuntimeTryGetConst(IDebugOverlay.Events);
    debugOverlay?.imguiMainMenuBar.Unregister(this);
    debugOverlay?.imguiShortcuts.Unregister(this);
    const gameflowEvents = this.RuntimeTryGetConst(IGameflowIntegration.Events);
    if (gameflowEvents) for (const event of Object.values(gameflowEvents)) event.Unregister(this);

    this.RuntimeRemove(IDebugAutomation);
    this.RuntimeRemove(IDebugAutomation.Events);

    this.RuntimeRemove(IAutomationManager);
    this.RuntimeRemove(IAutomationManager.Events);

    super.Deinit();
  }

  Process() {
    super.Process();

    // C++ saves the window's state at the end of its ImGuiDraw, every frame
    this.m_imguiWindowOpen.Save();
  }

  private OnImGuiMainMenuBar(menuBar: MainMenuBar) {
    menuBar.MenuItem('Tools', 'Automation', () => {
      this.m_imguiWindowOpen.value = true;
    }, 'Ctrl+A');
  }

  private OnImGuiShortcuts(shortcuts: Shortcuts) {
    shortcuts.Shortcut('Ctrl+A', 'Open/Close automation window.', () => {
      this.m_imguiWindowOpen.value = !this.m_imguiWindowOpen.value;
    });
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The "Automation" window's Game Clock (C++ ImGuiDraw)
  ////////////////////////////////////////////////////////////////////////////////

  /** The Pause / Resume button: none without the platform's pause control. */
  GetPauseControl() {
    const pause = this.RuntimeTryGet(IPauseControl);
    return pause ? { held: pause.IsHeld(PauseReason.Debug) } : null;
  }

  TogglePause() {
    const pause = this.RuntimeTryGet(IPauseControl);
    if (!pause) return;
    if (pause.IsHeld(PauseReason.Debug)) {
      pause.Release(PauseReason.Debug);
    } else {
      pause.Request(PauseReason.Debug);
    }
  }

  GetClockSpeed() {
    return Clock.GetSpeed();
  }

  SetClockSpeed(speed: number) {
    Clock.SetSpeed(speed);
  }

  GetGamesCount() {
    return this.m_games.length;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// IAutomationManager, IDebugAutomation
  ////////////////////////////////////////////////////////////////////////////////

  ShouldOverrideRng() {
    return this.m_engine !== null;
  }

  GetOverrideRng(): IRng {
    if (!this.m_engine) throw new Error('AutomationManager: no override engine');
    return this.m_engine;
  }

  IsStarted() {
    return this.m_mode !== AutomationMode.Disabled;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The games
  ////////////////////////////////////////////////////////////////////////////////

  ClearGames(resetGameNumber = true) {
    console.info(`AutomationManager: Cleared ${this.m_games.length} games`);
    this.m_games = [];
    if (resetGameNumber) {
      this.m_nextGameNumber = 1;
    }
  }

  /** ImportGames: the games of a CSV (Game, Bet, Win, Rng, RoundRngCounts, Label) after the recorded ones. */
  ImportGames(text: string) {
    try {
      const [colNames, ...rows] = ParseCsvRows(text);
      if (!colNames) throw new Error('the file has no header row');
      const column = (name: string) => colNames.indexOf(name);
      if (column('Bet') < 0 || column('Win') < 0 || column('Rng') < 0) throw new Error('the file has no Bet, Win or Rng column');
      const hasLabel = column('Label') >= 0;
      const hasRoundRngCounts = column('RoundRngCounts') >= 0;
      let importCount = 0;
      for (const row of rows) {
        const game = NewGameData();
        game.game = this.m_nextGameNumber++;
        game.bet = Number(row[column('Bet')]);
        game.win = Number(row[column('Win')]);
        game.rng = LoadRngSequence(row[column('Rng')] ?? '');
        if (hasRoundRngCounts) {
          game.roundRngCounts = LoadRoundRngCounts(row[column('RoundRngCounts')] ?? '');
        }
        if (hasLabel) {
          game.label = row[column('Label')] ?? '';
        } else {
          game.label = `Game ${game.game}`;
        }
        this.m_games.push(game);
        ++importCount;
      }
      console.info(`AutomationManager: Imported ${importCount} games`);
      return true;
    } catch (error) {
      console.error(`AutomationManager: csv import error: msg=${(error as Error).message}`);
      return false;
    }
  }

  /** ExportGames: the recorded games as a CSV. */
  ExportGames() {
    const lines = [['Game', 'Bet', 'Win', 'Rng', 'RoundRngCounts', 'Label'].join(',')];
    for (const game of this.m_games) {
      const rngText = FormatRngSequence(game.rng);
      const roundRngCountsText = FormatRoundRngCounts(game.roundRngCounts);
      lines.push([game.game, game.bet, game.win, rngText, roundRngCountsText, game.label].map(CsvField).join(','));
    }
    console.info(`AutomationManager: Exported ${this.m_games.length} games`);
    return `${lines.join('\n')}\n`;
  }

  /** AutoExportGames: the C++ appends the games to autoExportGamesPath once there are autoExportGamesCount; the
   * browser cannot write a path. */
  private AutoExportGames() {
    if (!this.m_config.autoExportGamesCount) return false;
    return false;
  }

  /** The numbers a Truserv server sends for a game: each number's 32 random bits, each round's padded to the
   * requests' 32 numbers. */
  static GenerateTruservServerRng(game: GameData) {
    /// Must match how TruservServerKernel::RequestRandoms is used.
    const RequestRandomsCount = 32;

    const result: number[] = [];
    let rngNext = 0;
    const rngEnd = game.rng.data.length;

    for (const roundRngCount of game.roundRngCounts) {
      const paddedCount = RoundUpToMultiple(roundRngCount, RequestRandomsCount);
      let i = 0;
      for (i = 0; i < roundRngCount; ++i) {
        if (rngNext === rngEnd) {
          console.assert(false, 'AutomationManager: a game has fewer numbers than its rounds');
          return [];
        }
        result.push(InverseUniform(game.rng.data[rngNext].value, game.rng.data[rngNext].range));
        ++rngNext;
      }
      for (; i < paddedCount; ++i) {
        result.push(InverseUniform(0, 0));
      }
    }
    console.assert(rngNext === rngEnd);

    return result;
  }

  /** ExportTruservDemoXml: a demo menu button per game, with the server's numbers. */
  ExportTruservDemoXml() {
    const lines = ['<?xml version="1.0"?>', '<demo>'];
    for (const game of this.m_games) {
      // The sequence set by a button in demo_menu.xml is valid until the game is exited or for a configured
      // number of game events (default = 1).
      // The current Truserv integration skips StartMatchRequest and EndRoundRequest, only StartRoundRequest
      // and EndMatchRequest are sent to the server, but EndMatchRequest should not consume random numbers, so
      // "noOfGameEvents" should be set to number of rounds.
      lines.push(`\t<button text="${XmlAttribute(game.label)}" noOfGameEvents="${game.roundRngCounts.length}">`);
      for (const value of AutomationManager.GenerateTruservServerRng(game)) {
        lines.push(`\t\t<rnd>${value}</rnd>`);
      }
      lines.push('\t</button>');
    }
    lines.push('</demo>');
    console.info(`AutomationManager: Exported ${this.m_games.length} games`);
    return `${lines.join('\n')}\n`;
  }

  /** ExportTruservGameloaderXml: a gameloader random per game, named by its label's start. */
  ExportTruservGameloaderXml() {
    const lines = ['<?xml version="1.0"?>', '<configuration>', '\t<game>', '\t\t<rng>'];
    for (const game of this.m_games) {
      const shortLabel = game.label.slice(0, this.m_config.gameloaderMaxGameNameLength);
      lines.push(`\t\t\t<random name="${XmlAttribute(shortLabel)}" values="${AutomationManager.GenerateTruservServerRng(game).join(',')}" />`);
    }
    lines.push('\t\t</rng>', '\t</game>', '</configuration>');
    console.info(`AutomationManager: Exported ${this.m_games.length} games`);
    return `${lines.join('\n')}\n`;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// Automation
  ////////////////////////////////////////////////////////////////////////////////

  private LoadAutomationView() {
    const config: ModuleConfig = { wheelStrategy: this.m_strategyMode === StrategyMode.Wheel };

    switch (this.m_viewMode) {
      case ViewMode.Instant:
        config.autoInput = true;
        config.skipAnims = true;
        break;
      case ViewMode.AutoInput:
        config.autoInput = true;
        config.skipAnims = false;
        break;
      case ViewMode.ManualInput:
        config.autoInput = false;
        config.skipAnims = false;
        break;
    }

    const moduleManager = this.RuntimeGet(IModuleManager);
    const loaded = moduleManager.LoadModule(this.GetRuntime(), { name: this.m_config.stubViewModule.name, config });
    console.assert(loaded, 'AutomationManager: the automation view did not load');
  }

  private UnloadAutomationView() {
    const moduleManager = this.RuntimeGet(IModuleManager);
    if (moduleManager.IsModuleLoaded(this.m_config.stubViewModule.name)) {
      moduleManager.UnloadModule(this.m_config.stubViewModule.name);
    }
  }

  ReplayGame(game: number) {
    if (this.m_mode !== AutomationMode.Disabled) return;

    const index = game - 1;
    if (!(index >= 0 && index < this.m_games.length)) return;

    this.m_autoGameCounter = 1;

    const engine = new HistoryEngine(new ReplayEngine());
    engine.engine.SetNumbers(this.m_games[index].rng.data);

    this.m_engine = engine;

    this.StartAutomationInternal(AutomationMode.ReplayGame);
  }

  ReplayAllGames() {
    if (this.m_mode !== AutomationMode.Disabled) return;

    this.m_autoGameCounter = this.m_games.length;

    const rng: RngSequence = { data: [] };
    for (const game of this.m_games) {
      rng.data.push(...game.rng.data);
    }

    const engine = new HistoryEngine(new ReplayEngine());
    engine.engine.SetNumbers(rng.data);

    this.m_engine = engine;

    this.StartAutomationInternal(AutomationMode.ReplayAllGames);
  }

  GenerateGames(count: number) {
    if (this.m_mode !== AutomationMode.Disabled) return;
    if (!(count > 0 && count <= MaxGenerateCount)) {
      console.assert(false, 'AutomationManager: a count of games out of range');
      return;
    }

    this.m_autoGameCounter = count;

    if (this.m_generateSeedMode !== SeedMode.None) {
      const generateEngine = new HistoryEngine(new MonteCarloEngineHat());
      generateEngine.engine.SetSeed(this.m_generateSeed);
      this.m_engine = generateEngine;
    }

    this.StartAutomationInternal(AutomationMode.GenerateGames);
  }

  private StartAutomationInternal(mode: AutomationMode) {
    console.assert(this.m_mode === AutomationMode.Disabled);
    if (mode === AutomationMode.Disabled) return;

    this.m_mode = mode;

    this.LoadAutomationView();

    this.m_automationEvents.automationStarted.Post(this.m_mode);
    this.m_debugAutomationEvents.automationStarted.Post();
  }

  StopAutomation(complete: boolean) {
    if (this.m_mode === AutomationMode.Disabled) return;
    const prev = this.m_mode;

    switch (prev) {
      case AutomationMode.ReplayGame:
      case AutomationMode.ReplayAllGames:
        {
          const engine = this.m_engine as ReplayHistoryEngine | null;
          console.assert(!!engine);
          if (engine && complete) {
            console.assert(engine.engine.IsEmpty(), 'AutomationManager: the replay left numbers');
          }
        }
        break;

      case AutomationMode.GenerateGames:
        if (this.m_generateSeedMode === SeedMode.Once) {
          /// Increment seed for next generate
          ++this.m_generateSeed;
        }
        break;

      default:
        break;
    }

    this.UnloadAutomationView();

    this.m_mode = AutomationMode.Disabled;
    this.m_engine = null;
    this.m_autoGameCounter = 0;
    this.m_debugAutomationEvents.automationStopped.Post();
    this.m_automationEvents.automationStopped.Post(prev);
  }

  private OnGameflowMatchStarted(creditBet: number) {
    this.m_gameInProgress = NewGameData();
    this.m_gameInProgress.game = this.m_nextGameNumber++;
    this.m_gameInProgress.bet = creditBet;
    this.m_gameInProgress.seed = this.m_generateSeed;

    if (this.m_mode === AutomationMode.GenerateGames && this.m_engine) {
      const engine = this.m_engine as GenerateEngine;
      if (engine.engine instanceof MonteCarloEngineHat) {
        switch (this.m_generateSeedMode) {
          case SeedMode.Incremental: engine.engine.SetSeed(this.m_generateSeed); break;
          default: break;
        }
      }
    }
  }

  private OnGameflowMatchCanceled(_creditBet: number) {
    if (!this.m_gameInProgress) return;
    this.m_gameInProgress = null;
    this.StopAutomation(false);
  }

  private OnGameflowRoundStarting(_roundType: GameRoundType) {
    if (!this.m_gameInProgress) return;

    if (this.m_engine) {
      this.m_engine.ClearHistory();
    }
  }

  private OnGameflowRoundStarted(_roundType: GameRoundType) {
    if (!this.m_gameInProgress) return;

    const roundRngSequence = this.RuntimeGet(IGameflowIntegration).GetRoundRng().GetHistory();
    this.m_gameInProgress.rng.data.push(...roundRngSequence.data);
    this.m_gameInProgress.roundRngCounts.push(roundRngSequence.data.length);
  }

  private OnGameflowMatchEnded(creditWin: number) {
    if (!this.m_gameInProgress) return;
    this.m_gameInProgress.win = creditWin;

    switch (this.m_mode) {
      case AutomationMode.ReplayGame:
        /// Do nothing
        /// Note: Use ReplayAllGames to populate round RNG counts if they were not loaded from CSV
        break;

      case AutomationMode.ReplayAllGames:
        {
          const index = this.m_games.length - this.m_autoGameCounter;
          console.assert(index < this.m_games.length);
          console.assert(this.m_games[index].win === this.m_gameInProgress.win, 'AutomationManager: a replayed game won otherwise');
          /// If round RNG counts were not loaded from CSV, populate them from replay
          if (!this.m_games[index].roundRngCounts.length) {
            this.m_games[index].roundRngCounts = this.m_gameInProgress.roundRngCounts;
          }
          const rngCounts = this.m_games[index].roundRngCounts;
          console.assert(this.m_games[index].rng.data.length === rngCounts.reduce((sum, count) => sum + count, 0));
        }
        break;

      case AutomationMode.GenerateGames:
        /// Record generated game
        this.m_games.push(this.m_gameInProgress);
        this.AutoExportGames();

        /// Increment seed to prepare for next game/generate
        switch (this.m_generateSeedMode) {
          case SeedMode.Incremental: ++this.m_generateSeed; break;
          default: break;
        }
        break;

      case AutomationMode.Disabled:
        /// Record all games by default, so any played game can be replayed or exported. Useful when using RNG
        /// presets/picker to export games for simulator verification or to feed third-party rng servers.
        this.m_games.push(this.m_gameInProgress);
        this.AutoExportGames();
        break;

      case AutomationMode.Undefined:
        console.assert(false, 'Invalid automation mode');
        break;
    }

    this.m_gameInProgress = null;

    if (this.m_autoGameCounter > 0) {
      --this.m_autoGameCounter;
      if (!this.m_autoGameCounter) {
        this.StopAutomation(true);
      }
    }
  }
}

