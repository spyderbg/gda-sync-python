// Egt::Integration::RngPresetManager (integration/plugins/src/Egt/RngPresetManager, a module of the QA builds): the
// RNG Queue. The RNG tools (the RNG Picker, the RNG Presets) add RNG sequences to it by round type (IRngPreset); when a
// round of the first sequence's type starts (the gameflow's roundStarting), the round runs on an engine that plays the
// sequence's numbers (OverrideEngine) and records them, instead of the kernel's numbers (IRngPresetManager), until the
// round has started (roundStarted).
//
// Its ImGui windows, "RNG Queue" (Tools → RNG Queue) and, when math details are hidden, "RNG Picker##7" (raw stops to
// add), are drawn by the Play page in Vue (debug/RngQueueWindow.vue) from this module's state: ImGuiDraw's rows are
// GetRngQueueRows, its buttons the commands below.
//
// The browser game's queue is the game server's (integration/GameServer, browser only): the queue of every window of
// the game's tools, the Play page's and the Game tools page's. The module shows the server's queue as the server last
// told it, and makes each change to it there too; a round of the first sequence's type gets the sequence from the server,
// which takes it out of the queue, before the round's random numbers come.

import { IGameflowIntegration } from '@game/integration/Runtime/IGameflowIntegration';
import { IRngPresetManager, IRngPresetManagerEvents } from '@game/integration/Runtime/IRngPresetManager';
import { IRngQueueGridPreview, type IRngGridPreviewPtr } from '@game/integration/Runtime/IRngQueueGridPreview';
import { type GameRoundType, RoundType_Main } from '@game/engine/Game/Math/Common.data';
import { IDebugOverlay, type MainMenuBar } from '@game/engine/Game/RuntimeExport/IDebugOverlay';
import { IMathTypes } from '@game/engine/Game/RuntimeExport/IMathTypes';
import { IRngPreset, IRngPresetEvents } from '@game/engine/Game/RuntimeImport/IRngPreset';
import { MementoEngine, MonteCarloEngineHat, type RngNumber, RngOp, type RngSequence } from '@game/engine/GameCore/Random/IRng';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { SBool } from '@game/engine/ImGuiEx/Extensions/Utils';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { type GameServer, IGameServer, type QueuedRngSequence, type RngQueueState } from '@game/integration/GameServer/GameServer';

const kScenarioTagPrefix = '__SCENARIO__:';

const MASK64 = (1n << 64n) - 1n;

function IsUnlockCode(candidate: string) {
  //   0       3       8       4       7
  const encoded = [0xcd, 0x91, 0x84, 0xfb, 0x74];
  const seed = 4829577n;
  const inc = 1442695040888963407n;
  let state = (seed + inc) & MASK64;

  const pcg32 = () => {
    const rot = Number(state >> 59n);
    const x = Number((((state >> 18n) ^ state) >> 27n) & 0xffffffffn);
    state = (state * 6364136223846793005n + (inc | 1n)) & MASK64;
    return ((x >>> rot) | (x << ((32 - rot) & 31))) >>> 0; // std::rotr(x, rot)
  };

  if (candidate.length !== encoded.length) {
    return false;
  }

  for (let i = 0; i < candidate.length; ++i) {
    // C++ compares chars: the low byte
    if (((candidate.charCodeAt(i) ^ pcg32()) & 0xff) !== encoded[i]) {
      return false;
    }
  }

  return true;
}

interface ParsedScenarioName {
  displayName: string;
  isScenario: boolean;
  groupId: number;
}

function ParseScenarioTaggedName(rawName: string): ParsedScenarioName {
  const parsed: ParsedScenarioName = { displayName: rawName, isScenario: false, groupId: 0 };

  if (!rawName.startsWith(kScenarioTagPrefix)) {
    return parsed;
  }

  const payload = rawName.slice(kScenarioTagPrefix.length);
  const separatorPos = payload.indexOf(':');
  if (separatorPos < 0) {
    return parsed;
  }

  const groupIdView = payload.slice(0, separatorPos);
  if (!groupIdView) {
    return parsed;
  }

  let groupId = 0;
  for (const ch of groupIdView) {
    if (ch < '0' || ch > '9') {
      return parsed;
    }

    groupId = groupId * 10 + (ch.charCodeAt(0) - 48);
  }

  parsed.displayName = payload.slice(separatorPos + 1);
  parsed.isScenario = true;
  parsed.groupId = groupId;
  return parsed;
}

/** A scenario's rows' background (ImGui's RowBg0), as a CSS colour. */
export function ScenarioRowBackgroundColor(scenarioGroupId: number) {
  const kScenarioColors = [
    [0.36, 0.53, 0.82, 0.25], // soft blue
    [0.35, 0.62, 0.43, 0.25], // soft green
    [0.63, 0.48, 0.76, 0.25], // soft violet
    [0.72, 0.55, 0.36, 0.25], // soft amber
    [0.34, 0.61, 0.64, 0.25], // soft teal
  ];

  const paletteIndex = (scenarioGroupId === 0 ? 0 : scenarioGroupId - 1) % kScenarioColors.length;
  const [r, g, b, a] = kScenarioColors[paletteIndex];
  return `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`;
}

export enum RngQueueDataColumn {
  Round = 0,
  Name,
  Operation,
  Rng,
  Range,
  Count,
}

export const RngQueueDataColumnCount = RngQueueDataColumn.Count;
export const RngQueueTooltipGridPreview = RngQueueDataColumnCount;
export const RngQueueTooltipContentCount = RngQueueDataColumnCount + 1;

interface RngQueueEntry {
  roundType: GameRoundType;
  name: string;
  sequence: RngSequence;
  isScenario: boolean;
  scenarioGroupId: number;
  /** Its id in the game server's queue (browser only): 0 until the server has it. */
  id: number;
}

/** A sequence of the game server's queue, as the module keeps it (browser only). */
function RngQueueEntryOf(queued: QueuedRngSequence): RngQueueEntry {
  const parsedScenarioName = ParseScenarioTaggedName(queued.name);
  return {
    roundType: queued.roundType, name: parsedScenarioName.displayName, sequence: { data: queued.sequence.map(rng => ({ ...rng })) },
    isScenario: parsedScenarioName.isScenario, scenarioGroupId: parsedScenarioName.groupId, id: queued.id,
  };
}

/** A row of the RNG Queue's table: a queued sequence (its numbers as its children), or one of its numbers. */
export interface RngQueueRow {
  columnTexts: string[];
  roundType: GameRoundType;
  /** The numbers the row's tooltip previews: the sequence's, or a number's with those before it. */
  sequence: RngSequence;
  isScenario: boolean;
  background: string | null;
  children: RngQueueRow[];
}

export class RngPresetManager extends BaseModule implements IRngPreset, IRngPresetManager {
  private readonly m_rngPresetEvents = new IRngPresetEvents();
  private readonly m_rngPresetManagerEvents = new IRngPresetManagerEvents();

  readonly m_imguiWindowOpen = new SBool('RngQueue_open');
  readonly m_rngQueueColumnVisible = [true, true, true, true, true];
  m_rngQueueTooltipColumn: number = RngQueueDataColumn.Name;

  private m_mathDetailsHidden = false;
  readonly m_imguiUnlockWindowOpen = new SBool('RngQueueUnlock_open');
  m_unlockWindowText = '';
  readonly m_unlockWindowTextLines: string[] = [];

  private m_rngOverrides: RngQueueEntry[] = [];
  private m_engine: MementoEngine<MonteCarloEngineHat> | null = null;

  /** The game server, whose queue this is (browser only; none: the queue is the module's, as in C++). */
  private m_server: GameServer | null = null;
  /** The server's queue the module shows (browser only). */
  private m_serverQueue: RngQueueState | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    this.m_mathDetailsHidden = config.mathDetailsHidden === true;
    this.m_server = this.RuntimeTryGet(IGameServer) ?? null;

    this.RuntimeAdd(IRngPreset, this);
    this.RuntimeAdd(IRngPreset.Events, this.m_rngPresetEvents);
    this.RuntimeAdd(IRngPresetManager, this);
    this.RuntimeAdd(IRngPresetManager.Events, this.m_rngPresetManagerEvents);

    const debugOverlay = this.RuntimeTryGetConst(IDebugOverlay.Events);
    if (debugOverlay) {
      debugOverlay.imguiMainMenuBar.RegisterInstant(this, menuBar => this.OnImGuiMainMenuBar(menuBar));
    }

    this.m_imguiWindowOpen.Load();
    this.m_imguiUnlockWindowOpen.Load();

    return true;
  }

  PostInit() {
    if (!super.PostInit()) return false;

    // The Game tools page has no gameflow: the game plays in another window, which takes its rounds' sequences from the
    // server; the events this page gets of that game are for its tools to follow (browser only).
    if (this.m_server && !this.RuntimeTryGetConst(IGameflowIntegration)) return true;

    const gameflowEvents = this.RuntimeGetConst(IGameflowIntegration.Events);
    gameflowEvents.roundStarting.RegisterInstant(this, roundType => this.OnGameflowRoundStarting(roundType));
    gameflowEvents.roundStarted.RegisterInstant(this, roundType => this.OnGameflowRoundStarted(roundType));

    return true;
  }

  Deinit() {
    this.RuntimeTryGetConst(IDebugOverlay.Events)?.imguiMainMenuBar.Unregister(this);
    const gameflowEvents = this.RuntimeTryGetConst(IGameflowIntegration.Events);
    gameflowEvents?.roundStarting.Unregister(this);
    gameflowEvents?.roundStarted.Unregister(this);

    this.RuntimeRemove(IRngPreset);
    this.RuntimeRemove(IRngPreset.Events);
    this.RuntimeRemove(IRngPresetManager);
    this.RuntimeRemove(IRngPresetManager.Events);

    this.m_rngOverrides = [];
    this.m_server = null;
    this.m_serverQueue = null;

    super.Deinit();
  }

  Process() {
    super.Process();

    this.ReadServerQueue();

    // C++ saves the windows' state at the end of its ImGuiDraw, every frame
    this.m_imguiWindowOpen.Save();
    this.m_imguiUnlockWindowOpen.Save();
  }

  /** The game server's queue, when it told a new one (browser only): what every window of the game's tools shows. */
  private ReadServerQueue() {
    const state = this.m_server?.GetQueue();
    if (!state || state === this.m_serverQueue) return;
    this.m_serverQueue = state;
    this.m_rngOverrides = state.queue.map(RngQueueEntryOf);
  }

  private OnImGuiMainMenuBar(menuBar: MainMenuBar) {
    if (this.AreMathDetailsHidden()) {
      // if password protected
      menuBar.MenuItem('Tools', 'RNG Picker', () => {
        this.m_imguiUnlockWindowOpen.value = true;
      });
    } else {
      menuBar.MenuItem('Tools', 'RNG Queue', () => {
        this.m_imguiWindowOpen.value = true;
      });
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The "RNG Queue" window (C++ ImGuiDraw)
  ////////////////////////////////////////////////////////////////////////////////

  /** The table's rows: a sequence's, then, when it is open, a row per number. */
  GetRngQueueRows(): RngQueueRow[] {
    return this.m_rngOverrides.map((entry, positionInList) => {
      const roundType = entry.roundType;
      const rngSequence = entry.sequence;
      const roundName = this.GetRoundName(roundType);
      const nodeSequenceName = `${positionInList + 1}. ${roundName}`;
      let rngsText = '';
      let rangesText = '';
      for (const rng of rngSequence.data) {
        rngsText = `${rngsText}${rngsText ? ',' : ''}${rng.value}`;
        rangesText = `${rangesText}${rangesText ? ',' : ''}${rng.range}`;
      }
      const background = entry.isScenario ? ScenarioRowBackgroundColor(entry.scenarioGroupId) : null;

      const rngPrefix: RngNumber[] = [];
      const children = rngSequence.data.map(rng => {
        rngPrefix.push(rng);
        return {
          columnTexts: [roundName, '--', RngOp[rng.op] ?? String(rng.op), String(rng.value), String(rng.range)],
          roundType, sequence: { data: [...rngPrefix] }, isScenario: entry.isScenario, background, children: [],
        };
      });

      return {
        columnTexts: [nodeSequenceName, entry.name || '--', '--', rngsText || '--', rangesText || '--'],
        roundType, sequence: rngSequence, isScenario: entry.isScenario, background, children,
      };
    });
  }

  /** What a row's tooltip shows (ImGuiShowRngQueueRowTooltip): one of its columns, or its grid preview. */
  GetRngQueueRowTooltip(row: RngQueueRow): { text: string } | { preview: IRngGridPreviewPtr } | null {
    if (this.m_rngQueueTooltipColumn < 0) return null;
    if (this.m_rngQueueTooltipColumn >= RngQueueTooltipContentCount) return null;

    if (this.m_rngQueueTooltipColumn === RngQueueTooltipGridPreview) {
      const gridPreview = this.RuntimeTryGetConst(IRngQueueGridPreview);
      if (gridPreview) {
        return { preview: gridPreview.BuildPreview(row.roundType, row.sequence) };
      }
      return { text: 'Grid preview unavailable' };
    }

    return { text: row.columnTexts[this.m_rngQueueTooltipColumn] };
  }

  /** "Visible Columns": the Round column is always shown, and the last other one shown cannot be hidden. */
  SetRngQueueColumnVisible(columnIndex: number, visible: boolean) {
    const visibleCount = this.m_rngQueueColumnVisible.filter(Boolean).length;
    const isAlwaysVisibleColumn = columnIndex === 0;
    const isOnlyVisibleColumn = !isAlwaysVisibleColumn && this.m_rngQueueColumnVisible[columnIndex] && visibleCount <= 1;
    if (isAlwaysVisibleColumn || isOnlyVisibleColumn) return;
    this.m_rngQueueColumnVisible[columnIndex] = visible;
  }

  static GetRngQueueDataColumnName(column: RngQueueDataColumn) {
    switch (column) {
      case RngQueueDataColumn.Round: return 'Round';
      case RngQueueDataColumn.Name: return 'Name';
      case RngQueueDataColumn.Operation: return 'Operation';
      case RngQueueDataColumn.Rng: return 'RNG';
      case RngQueueDataColumn.Range: return 'Range';
      default: return '';
    }
  }

  BuildRngQueueVisibleColumnsPreview() {
    const visibleCount = this.m_rngQueueColumnVisible.filter(Boolean).length;
    if (visibleCount === RngQueueDataColumnCount) {
      return 'All';
    }
    if (visibleCount === 0) {
      return 'None';
    }

    let preview = '';
    for (let columnIndex = 0; columnIndex < RngQueueDataColumnCount; ++columnIndex) {
      if (!this.m_rngQueueColumnVisible[columnIndex]) continue;
      if (preview) {
        preview += ', ';
      }
      preview += RngPresetManager.GetRngQueueDataColumnName(columnIndex);
    }

    return preview;
  }

  static GetRngQueueTooltipContentName(tooltipContent: number) {
    if (tooltipContent === RngQueueTooltipGridPreview) {
      return 'Preview';
    }

    if (tooltipContent >= 0 && tooltipContent < RngQueueDataColumnCount) {
      return RngPresetManager.GetRngQueueDataColumnName(tooltipContent);
    }

    return '';
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The "RNG Picker##7" window, when math details are hidden (C++ ImGuiDraw)
  ////////////////////////////////////////////////////////////////////////////////

  /** Its Add button: comma-separated stops of the main round, each modulo 11 (not to give away the reels' lengths),
   * or the unlock code, which shows the math details. */
  AddUnlockWindowText() {
    let text = this.m_unlockWindowText;

    if (IsUnlockCode(text)) {
      this.m_mathDetailsHidden = false;
      text = 'unlocked';
    }

    const rngs: RngSequence = { data: [] };
    const split = text.split(',');

    for (const s of split) {
      if (!s) continue;
      if (/[A-Za-z]/.test(s)) continue;

      let rngValue = Number.parseInt(s.trim(), 10);
      if (!Number.isFinite(rngValue) || rngValue < 0) rngValue = 0; // std::istringstream >> uint32_t
      rngValue = rngValue % 11; // don't give away reel length
      rngs.data.push({ op: RngOp.StopReels, range: 0, value: rngValue });
    }

    if (rngs.data.length > 0) {
      this.AddRngSequence(RoundType_Main, rngs);
    }

    if (text.length > 0) {
      this.m_unlockWindowTextLines.unshift(text);
      this.m_unlockWindowText = '';

      if (this.m_unlockWindowTextLines.length > 10) {
        this.m_unlockWindowTextLines.pop();
      }
    }
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// IRngPresetManager, IRngPreset
  ////////////////////////////////////////////////////////////////////////////////

  ShouldOverrideRng() {
    return this.m_engine !== null;
  }

  HasRngSequences() {
    return this.m_rngOverrides.length > 0;
  }

  GetOverrideRng() {
    if (!this.m_engine) throw new Error('RngPresetManager: no override engine');
    return this.m_engine;
  }

  AddRngSequence(roundType: GameRoundType, newRngs: RngSequence, name = '') {
    const parsedScenarioName = ParseScenarioTaggedName(name);
    this.m_rngOverrides.push({
      roundType, name: parsedScenarioName.displayName, sequence: { data: [...newRngs.data] },
      isScenario: parsedScenarioName.isScenario, scenarioGroupId: parsedScenarioName.groupId, id: 0,
    });
    // the server's queue, under the name as it came (browser only)
    this.m_server?.AddRngSequences([{ roundType, name, sequence: newRngs.data }]);
    return true;
  }

  PopRngSequence(roundType: GameRoundType): RngSequence {
    if (!this.m_rngOverrides.length) return { data: [] };
    if (this.m_rngOverrides[0].roundType !== roundType) return { data: [] };

    const entry = this.m_rngOverrides.shift()!;
    this.DeleteServerSequence(entry); // browser only
    return entry.sequence;
  }

  AreMathDetailsHidden() {
    return this.m_mathDetailsHidden;
  }

  ClearRngSequences() {
    this.DeleteAllOverrideRngs();
  }

  private OnGameflowRoundStarting(roundType: GameRoundType) {
    if (this.m_server) {
      // the game server deals the round the queue's first sequence, when it is of the round's type (browser only)
      this.m_server.StartRound(roundType, sequence => this.OnServerRoundSequence(sequence));
      return;
    }

    if (!this.m_rngOverrides.length) return;
    if (this.m_rngOverrides[0].roundType !== roundType) return;

    console.assert(!this.m_engine, 'RngPresetManager: an override engine is active');
    this.m_engine = new MementoEngine(new MonteCarloEngineHat());
    this.m_engine.PushOverride(this.m_rngOverrides.shift()!.sequence);
  }

  /** The sequence the game server dealt the round starting, before its random numbers (browser only): the round plays
   * it, as the C++ round plays the queue's first sequence. */
  private OnServerRoundSequence(sequence: RngNumber[] | null) {
    if (!sequence) return;

    console.assert(!this.m_engine, 'RngPresetManager: an override engine is active');
    this.m_engine = new MementoEngine(new MonteCarloEngineHat());
    this.m_engine.PushOverride({ data: sequence });
  }

  private OnGameflowRoundStarted(_roundType: GameRoundType) {
    this.m_engine = null;
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// The queue's commands
  ////////////////////////////////////////////////////////////////////////////////

  DeleteAllOverrideRngs() {
    this.m_rngOverrides = [];
    this.m_engine = null;
    this.m_server?.ClearRngSequences(); // browser only
  }

  DeleteOverrideRngsAt(position: number) {
    const [entry] = this.m_rngOverrides.splice(position, 1);
    this.DeleteServerSequence(entry); // browser only
  }

  MoveOverrideRngsUp(position: number) {
    if (position === 0) return;
    const queue = this.m_rngOverrides;
    this.MoveServerSequence(queue[position], queue[position - 1]); // browser only
    [queue[position - 1], queue[position]] = [queue[position], queue[position - 1]];
  }

  MoveOverrideRngsDown(position: number) {
    if (position + 1 >= this.m_rngOverrides.length) return;
    const queue = this.m_rngOverrides;
    this.MoveServerSequence(queue[position + 1], queue[position]); // browser only
    [queue[position], queue[position + 1]] = [queue[position + 1], queue[position]];
  }

  /** std::list::splice(itTo, list, itFrom): the entry goes before the one at toIndex (counted before the move). */
  MoveOverrideRngTo(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const n = this.m_rngOverrides.length;
    if (fromIndex >= n || toIndex >= n) return;
    this.MoveServerSequence(this.m_rngOverrides[fromIndex], this.m_rngOverrides[toIndex]); // browser only
    const [entry] = this.m_rngOverrides.splice(fromIndex, 1);
    this.m_rngOverrides.splice(fromIndex < toIndex ? toIndex - 1 : toIndex, 0, entry);
  }

  /** The same change of the game server's queue, by the sequences' ids there (browser only). A sequence the server
   * does not have yet changes here only: the server's queue, when it comes, shows where it is. */
  private DeleteServerSequence(entry: RngQueueEntry | undefined) {
    if (entry?.id) this.m_server?.DeleteRngSequence(entry.id);
  }

  private MoveServerSequence(entry: RngQueueEntry, before: RngQueueEntry) {
    if (entry.id && before.id) this.m_server?.MoveRngSequence(entry.id, before.id);
  }

  GetRngsAsText() {
    let result = '';

    for (const entry of this.m_rngOverrides) {
      for (const rng of entry.sequence.data) {
        result += `${rng.value},`;
      }
    }

    if (result.length >= 1) {
      result = result.slice(0, -1);
    }

    return result;
  }

  GetRoundName(roundType: GameRoundType) {
    const mathTypes = this.RuntimeTryGetConst(IMathTypes);
    if (mathTypes) {
      return mathTypes.GetRoundTypeName(roundType);
    }
    return String(roundType);
  }
}
