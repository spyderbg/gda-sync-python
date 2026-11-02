// Egt::Game::AlphaFamily::RngToolReelRoundSubscreen (AlphaFamilyMathRngTool/RngToolReelRoundSubscreen.h/.cpp): a reel
// round's screen in the RNG Picker (the tetra round has four): its reels, which stop where the searched symbols are
// (a symbol per cell, a payline filled with one symbol, a reel set, the reels moved stop by stop), then the transform
// step (the symbols a spin's replace map gives the replaced ones, by distribution), then the hold and spin's drops.
// GetRngOperationsForVisibleOutcome gives the RNG numbers that make the round show it.
//
// The C++ draws each step with ImGui every frame, handling a click where it draws the button. Draw(click) runs a frame
// the same way: each step builds its view, applies the click if it is the step's, and merges the step's outcome; the
// views are what debug/RngPickerWindow.vue draws, and its clicks come back as Draw(click).

import { type RngSequence } from '@game/engine/GameCore/Random/IRng';
import { RoundType, SymbolGridCoordinates, type Lines, type SymbolGrid, type SymbolId, type SymbolIds } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { Weighted } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Weighted';
import type { ReelRoundRulesConfig } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules.data';
import { ResultToRng } from '@game/alpha_family/libs/AlphaFamilyMathToolUtils/ResultToRng';
import { RulesHelper } from '@game/alpha_family/libs/AlphaFamilyMathToolUtils/RulesHelper';
import type { RngToolContext, RngToolQueue } from './RngToolContext';
import { RngToolReel, SymbolState } from './RngToolReel';

const ANY = RngToolReel.SEARCH_ANY_SYMBOL;

////////////////////////////////////////////////////////////////////////////////
/// The views a frame draws, and the clicks it takes
////////////////////////////////////////////////////////////////////////////////

/** A grid's cell (SymbolButton in ImGuiGridEdit): its symbol, and how it is drawn. */
export interface SymbolCellView {
  symbolId: SymbolId;
  coord: SymbolGridCoordinates;
  isSelected: boolean;
  isSearched: boolean;
  /** Disabled: it cannot be clicked. */
  isLocked: boolean;
  isLineMarked: boolean;
}

/** A grid (ImGuiGridEdit): its cells by row, then reel; arrows over and under the reels; a label under each. */
export interface SymbolGridView {
  rows: SymbolCellView[][];
  hasArrows: boolean;
  columnLabels: string[];
  isEnabled: boolean;
}

/** A palette (SymbolPalette): "Symbols", by symbol id, five a row. */
export interface SymbolPaletteView {
  symbols: { symbolId: SymbolId; isSelected: boolean; isSearched: boolean; isDisabled: boolean }[];
  isEnabled: boolean;
}

/** A number with arrows (the Reel Set and the Line Set). */
export interface CounterView {
  label: string;
  value: number;
  min: number;
  max: number;
}

export interface ReelingPhaseView {
  grid: SymbolGridView;
  palette: SymbolPaletteView;
  reelSet: CounterView | null;
  lineSet: CounterView | null;
}

export interface TransformStepView {
  isEnabled: boolean;
  distributions: string[];
  distributionIndex: number;
  grid: SymbolGridView;
  palette: SymbolPaletteView;
}

export type HoldAndSpinPhaseView =
  | { triggered: false }
  | { triggered: true; isEnabled: boolean; phaseIndex: number; phaseCount: number; grid: SymbolGridView; palette: SymbolPaletteView };

export interface SubscreenView {
  reeling: ReelingPhaseView;
  transform: TransformStepView | null;
  holdAndSpin: HoldAndSpinPhaseView | null;
}

export type SubscreenClick =
  | { kind: 'reelingCell'; coord: SymbolGridCoordinates; shift: boolean }
  | { kind: 'reelingUp' | 'reelingDown'; reel: number }
  | { kind: 'reelingPalette'; symbolId: SymbolId }
  | { kind: 'reelSet' | 'lineNumber'; value: number }
  | { kind: 'distribution'; index: number }
  | { kind: 'transformCell' | 'holdAndSpinCell'; coord: SymbolGridCoordinates }
  | { kind: 'transformPalette' | 'holdAndSpinPalette'; symbolId: SymbolId }
  | { kind: 'holdAndSpinPhase'; delta: number };

/** std::set<SymbolGridCoordinates>: by reel, then row. */
class CoordinateSet {
  private readonly m_items = new Map<string, SymbolGridCoordinates>();

  constructor(items: Iterable<SymbolGridCoordinates> = []) {
    for (const item of items) this.Insert(item);
  }

  Insert(coord: SymbolGridCoordinates) {
    this.m_items.set(coord.key(), new SymbolGridCoordinates(coord.reelId, coord.rowId));
  }

  Erase(coord: SymbolGridCoordinates) {
    this.m_items.delete(coord.key());
  }

  Contains(coord: SymbolGridCoordinates) {
    return this.m_items.has(coord.key());
  }

  Clear() {
    this.m_items.clear();
  }

  Size() {
    return this.m_items.size;
  }

  Values() {
    return [...this.m_items.values()].sort((a, b) => a.reelId - b.reelId || a.rowId - b.rowId);
  }
}

function BuildPaylineCellSet(lines: Lines, lineIndex: number, reelsCount: number, rowsCount: number) {
  const coords = new CoordinateSet();
  if (!(lineIndex >= 0 && lineIndex < lines.length)) return coords;

  const line = lines[lineIndex];
  for (let reelIdx = 0; reelIdx < line.length && reelIdx < reelsCount; ++reelIdx) {
    const row = line[reelIdx];
    if (row >= 0 && row < rowsCount) {
      coords.Insert(new SymbolGridCoordinates(reelIdx, row));
    }
  }
  return coords;
}

function MergeLineCellsSymbolStates(cells: CoordinateSet, reels: RngToolReel[]) {
  // Same symbol set as the main palette (line 0); only Active/Inactive changes per payline.
  const merged = new Map<SymbolId, SymbolState>();
  for (const reel of reels) {
    for (const sym of reel.GetAllSymbols()) {
      merged.set(sym, SymbolState.EActive);
    }
  }
  for (const c of cells.Values()) {
    const rowStates = reels[c.reelId].GetSymbolsState(c.rowId);
    for (const symId of merged.keys()) {
      const activeOnCell = rowStates.get(symId) === SymbolState.EActive;
      if (!activeOnCell) {
        merged.set(symId, SymbolState.EInactive);
      }
    }
  }
  merged.set(ANY, SymbolState.EActive);
  return merged;
}

/** SymbolGridViewData: a grid's symbols, the symbols searched, the selected, line-marked and locked cells. */
class SymbolGridViewData {
  m_symbols: SymbolGrid = [];
  m_search: SymbolGrid = [];
  m_select: SymbolGridCoordinates | null = null;
  m_lineSelect = new CoordinateSet();
  m_locked = new CoordinateSet();

  static Create(symbols: SymbolGrid) {
    const result = new SymbolGridViewData();
    result.m_symbols = symbols.map(reel => [...reel]);
    const reelsCount = symbols.length;
    if (reelsCount <= 0) return result;

    const rowsCount = symbols[0].length;
    result.m_search = Grid.Create(reelsCount, rowsCount, ANY);

    return result;
  }
}

/** ImGuiGridEdit's drawing: the cells by row, then reel. */
function GridView(view: SymbolGridViewData, hasArrows: boolean, columnLabels: string[], isEnabled: boolean): SymbolGridView {
  const reelsCount = view.m_symbols.length;
  const rowsCount = reelsCount ? view.m_symbols[0].length : 0;
  const rows: SymbolCellView[][] = [];
  for (let rowIndex = 0; rowIndex < rowsCount; ++rowIndex) {
    const row: SymbolCellView[] = [];
    for (let reelIndex = 0; reelIndex < reelsCount; ++reelIndex) {
      const coord = new SymbolGridCoordinates(reelIndex, rowIndex);
      row.push({
        symbolId: view.m_symbols[reelIndex][rowIndex],
        coord,
        isSelected: view.m_select !== null && view.m_select.equals(coord),
        isSearched: view.m_search[reelIndex][rowIndex] !== ANY,
        isLocked: view.m_locked.Contains(coord),
        isLineMarked: view.m_lineSelect.Contains(coord),
      });
    }
    rows.push(row);
  }
  return { rows, hasArrows, columnLabels, isEnabled };
}

/** SymbolPalette's drawing: the symbols by id (C++'s std::map). */
function PaletteView(selected: SymbolId, searched: SymbolId | null, symbols: Map<SymbolId, SymbolState>, isEnabled: boolean): SymbolPaletteView {
  return {
    symbols: [...symbols.keys()].sort((a, b) => a - b).map(symId => ({
      symbolId: symId,
      isSearched: searched !== null && searched === symId,
      isSelected: selected === symId,
      isDisabled: symbols.get(symId) === SymbolState.EInactive,
    })),
    isEnabled,
  };
}

namespace Grid {
  export function Create(reelsCount: number, rowsCount: number, defaultValue: SymbolId): SymbolGrid {
    return Array.from({ length: reelsCount }, () => new Array<SymbolId>(rowsCount).fill(defaultValue));
  }

  export function CountSymbols(reels: SymbolGrid, anySymbol: Set<SymbolId>) {
    let count = 0;
    for (const reel of reels) {
      count += reel.filter(cell => anySymbol.has(cell)).length;
    }
    return count;
  }

  export function ForEachCell(reels: SymbolGrid, fnPerCellIndex: (reel: number, row: number) => void) {
    for (let reelIndex = 0; reelIndex < reels.length; ++reelIndex) {
      for (let rowIndex = 0; rowIndex < reels[reelIndex].length; ++rowIndex) {
        fnPerCellIndex(reelIndex, rowIndex);
      }
    }
  }

  export function CompareEqual(lhs: SymbolGrid, rhs: SymbolGrid) {
    if (lhs.length !== rhs.length) return false;
    for (let reelIndex = 0; reelIndex < lhs.length; ++reelIndex) {
      if (lhs[reelIndex].length !== rhs[reelIndex].length) return false;
      for (let rowIndex = 0; rowIndex < lhs[reelIndex].length; ++rowIndex) {
        if (lhs[reelIndex][rowIndex] !== rhs[reelIndex][rowIndex]) return false;
      }
    }
    return true;
  }

  export function ApplyDiff(base: SymbolGrid, diff: SymbolGrid, ignoreDiffValues: Set<SymbolId>) {
    if (base.length !== diff.length) return false;

    let hasChanges = false;
    ForEachCell(base, (reelIndex, rowIndex) => {
      const diffCell = diff[reelIndex][rowIndex];
      const isDiff = !ignoreDiffValues.has(diffCell) && base[reelIndex][rowIndex] !== diffCell;
      if (isDiff) {
        base[reelIndex][rowIndex] = diffCell;
      }
      hasChanges ||= isDiff;
    });

    return hasChanges;
  }

  export function GetSymFrequencies(grid: SymbolGrid) {
    const frequencies = new Map<SymbolId, number>();
    for (const reel of grid) {
      for (const val of reel) frequencies.set(val, (frequencies.get(val) ?? 0) + 1);
    }
    return frequencies;
  }

  export function Copy(grid: SymbolGrid): SymbolGrid {
    return grid.map(reel => [...reel]);
  }
}

/** The weight of a symbol in a replace distribution (0 when it has none). */
function SymbolWeight(weighted: Weighted<SymbolId>, sym: SymbolId) {
  return weighted.range.find(weightSym => weightSym.value === sym)?.weight ?? 0;
}

/** The hold and spin step's selection, of each screen (C++'s function statics, shared by all the screens). */
let holdAndSpinPhaseIndex = 0;

export class SelectGridPaletteInfo {
  gridCell: SymbolGridCoordinates | null = null;
  paletteSymbolId: SymbolId | null = null;
}

export class VisibleOutcomeInfo {
  reelSetIndex: number | null = null;
  reeling: SymbolGrid = [];
  distributionIndex: number | null = null;
  transformedReeling: SymbolGrid | null = null;
  holdAndSpin: SymbolGrid[] = [];
}

/** DrawHoldAndSpinReels: the hold and spin grid of a phase, from the phase before it, and its palette; the click; the
 * phase's outcome merged (the phase before's, with the cells searched). */
function DrawHoldAndSpinReels(
  selector: SelectGridPaletteInfo,
  currentOutcome: SymbolGrid,
  previousOutcome: SymbolGrid,
  triggerRoundOutcome: SymbolGrid,
  context: RngToolContext,
  type: RoundType,
  distributionIndex: number,
  isEnabled: boolean,
  click: SubscreenClick | null,
): { grid: SymbolGridView; palette: SymbolPaletteView; outcome: SymbolGrid } {
  const math = context.m_mathRules!;

  const holdAndSpinRulesConfig = math.GetHoldAndSpinRoundRules(type).GetConfig();
  const inputSymbol = holdAndSpinRulesConfig.dropSymbolId;
  const repetition = holdAndSpinRulesConfig.replaceMaps.repetition;
  const replaceOutputSymbols = RulesHelper.GetHoldAndSpinReplacedOutputSymbols(math, type, distributionIndex, inputSymbol);
  const replaceInputSymbols = RulesHelper.GetHoldAndSpinReplaceInputSymbols(math, type, distributionIndex);
  const view = SymbolGridViewData.Create(currentOutcome);
  {
    // select
    view.m_select = selector.gridCell;

    // locked + search
    Grid.ForEachCell(previousOutcome, (reelIndex, rowIndex) => {
      const sym = previousOutcome[reelIndex][rowIndex];
      const isCoinSymbol = replaceInputSymbols.has(sym) || replaceOutputSymbols.has(sym);
      if (isCoinSymbol) {
        view.m_locked.Insert(new SymbolGridCoordinates(reelIndex, rowIndex));
      }
      if (currentOutcome[reelIndex][rowIndex] !== sym) {
        view.m_search[reelIndex][rowIndex] = currentOutcome[reelIndex][rowIndex];
      }
    });
  }

  const ignoreTriggerSymFrequencies = Grid.GetSymFrequencies(triggerRoundOutcome);
  const searchSymFrequencies = Grid.GetSymFrequencies(view.m_symbols);
  for (const [symId, symFrequency] of ignoreTriggerSymFrequencies) {
    searchSymFrequencies.set(symId, Math.max(0, (searchSymFrequencies.get(symId) ?? 0) - symFrequency));
  }
  const weightedReplaceSymbols = holdAndSpinRulesConfig.replaceMaps.range[distributionIndex].value.get(inputSymbol)!;

  // additional lock condition -  the symbols can run out of stock
  if (repetition && selector.paletteSymbolId !== null && selector.paletteSymbolId !== ANY) {
    const selectedSymId = selector.paletteSymbolId;
    const isRunOutOfSym = (sym: SymbolId) => (searchSymFrequencies.get(sym) ?? 0) >= SymbolWeight(weightedReplaceSymbols, sym);
    if (isRunOutOfSym(selectedSymId)) {
      // lock all cells with value different from the selected
      Grid.ForEachCell(view.m_symbols, (reelIndex, rowIndex) => {
        if (view.m_symbols[reelIndex][rowIndex] !== selectedSymId) {
          view.m_locked.Insert(new SymbolGridCoordinates(reelIndex, rowIndex));
        }
      });
    }
  }

  // prepare supported symbols
  const supportedSymbolsState = new Map<SymbolId, SymbolState>();
  for (const replacedSym of weightedReplaceSymbols.range) {
    const isRunOutOfSym = replacedSym.weight <= (searchSymFrequencies.get(replacedSym.value) ?? 0);
    const isSymActive = repetition ? !isRunOutOfSym : true;
    supportedSymbolsState.set(replacedSym.value, isSymActive ? SymbolState.EActive : SymbolState.EInactive);
  }
  supportedSymbolsState.set(ANY, SymbolState.EActive);

  const grid = GridView(view, false, [], isEnabled);
  if (click?.kind === 'holdAndSpinCell') {
    // cell is clicked
    const cell = click.coord;
    if (selector.paletteSymbolId !== null) {
      const selectedSymbolId = selector.paletteSymbolId;
      if (selectedSymbolId === ANY || view.m_search[cell.reelId][cell.rowId] === selectedSymbolId) {
        view.m_search[cell.reelId][cell.rowId] = ANY;
      } else {
        view.m_search[cell.reelId][cell.rowId] = selectedSymbolId;
      }
    } else if (selector.gridCell !== null && selector.gridCell.equals(cell)) {
      selector.gridCell = null;
    } else {
      selector.gridCell = new SymbolGridCoordinates(cell.reelId, cell.rowId);
    }
  }

  // there are 2 palette-behaviors
  let palette: SymbolPaletteView;
  if (selector.gridCell !== null) {
    // prepare supported symbols
    const { reelId: searchReelId, rowId: searchRowId } = selector.gridCell;

    const selectedPaletteSymbol = selector.paletteSymbolId ?? RngToolReel.DEFAULT_SELECTED_SYMBOL;
    const searchedPaletteSymbol = view.m_search[searchReelId][searchRowId];
    palette = PaletteView(selectedPaletteSymbol, searchedPaletteSymbol, supportedSymbolsState, isEnabled);
    if (click?.kind === 'holdAndSpinPalette') {
      if (searchedPaletteSymbol === click.symbolId) {
        view.m_search[searchReelId][searchRowId] = ANY;
      } else {
        view.m_search[searchReelId][searchRowId] = click.symbolId;
      }
    }
  } else {
    const selectedPaletteSymbol = selector.paletteSymbolId ?? RngToolReel.DEFAULT_SELECTED_SYMBOL;
    palette = PaletteView(selectedPaletteSymbol, null, supportedSymbolsState, isEnabled);
    if (click?.kind === 'holdAndSpinPalette') {
      if (selector.paletteSymbolId !== null && selector.paletteSymbolId === click.symbolId) {
        selector.paletteSymbolId = null;
      } else {
        selector.paletteSymbolId = click.symbolId;
      }
    }
  }

  // merge to alter the outcome
  const outcome = Grid.Copy(previousOutcome);
  // update with the search matrix
  Grid.ApplyDiff(outcome, view.m_search, new Set([ANY]));

  return { grid, palette, outcome };
}

export class RngToolReelRoundSubscreen {
  private m_subscreenIdx = 0;
  private m_type = RoundType.Undefined;
  private m_context: RngToolContext | null = null;
  private m_reelConfig: ReelRoundRulesConfig | null = null;
  private m_reels: RngToolReel[] = [];

  private m_select = new SelectGridPaletteInfo();
  private m_selectTransform = new SelectGridPaletteInfo();
  private m_selectHoldAndSpin = new SelectGridPaletteInfo();
  private m_linePaletteCells = new CoordinateSet();
  private m_lineLockedCells = new CoordinateSet();
  private m_lineNumberDisplay = 0;
  private m_lineSelectedSymbol: SymbolId | null = null;

  private m_outcome = new VisibleOutcomeInfo();

  private m_distributionsList: string[] = [];
  private m_reelingSelectionOrder = new Map<string, { coord: SymbolGridCoordinates; order: number }>();
  private m_reelingSelectionOrderCounter = 1;

  Init(type: RoundType, context: RngToolContext, subscreenIdx: number, reelConfig: ReelRoundRulesConfig) {
    this.m_type = type;
    this.m_context = context;
    this.m_subscreenIdx = subscreenIdx;
    this.m_reelConfig = reelConfig;

    this.InitVisualReels();

    this.m_select.gridCell = null;
    this.m_select.paletteSymbolId = null;
    this.m_lineNumberDisplay = 0;
    this.m_linePaletteCells.Clear();
    this.m_lineLockedCells.Clear();
    this.m_lineSelectedSymbol = null;
    this.ClearReelingSelectionOrder();
  }

  Deinit() {
    this.m_reels = [];
    this.m_type = RoundType.Undefined;
    this.m_context = null;
    this.m_lineNumberDisplay = 0;
    this.m_linePaletteCells.Clear();
    this.m_lineLockedCells.Clear();
    this.m_lineSelectedSymbol = null;
    this.ClearReelingSelectionOrder();
  }

  private SyncLinePaletteCellsFromLineNumberDisplay() {
    const previousSelectedCount = this.m_linePaletteCells.Size();
    const reelsCount = this.m_reels.length;
    const rowsCount = this.m_reelConfig!.rowsCount;
    if (this.m_lineNumberDisplay <= 0) {
      this.m_linePaletteCells.Clear();
      this.ApplySelectedSymbolToLineCells();
      return;
    }
    const lineIndex = this.m_lineNumberDisplay - 1;
    const newLineCells = BuildPaylineCellSet(this.m_reelConfig!.lineConfig.lines, lineIndex, reelsCount, rowsCount);

    if (previousSelectedCount <= 0 || previousSelectedCount >= newLineCells.Size()) {
      this.m_linePaletteCells = newLineCells;
      this.ApplySelectedSymbolToLineCells();
      return;
    }

    // by reel, then row
    const orderedLineCells = newLineCells.Values();

    this.m_linePaletteCells.Clear();
    for (let idx = 0; idx < previousSelectedCount; ++idx) {
      this.m_linePaletteCells.Insert(orderedLineCells[idx]);
    }
    this.ApplySelectedSymbolToLineCells();
  }

  private ClearReelingSearchMarkers() {
    for (const reel of this.m_reels) {
      const searchSymbols = new Array<SymbolId>(this.m_reelConfig!.rowsCount).fill(ANY);
      reel.SetSearchSymbols(searchSymbols);
    }
    this.ClearReelingSelectionOrder();
  }

  private ResetLineSelectionUiState() {
    this.m_select.gridCell = null;
    this.m_select.paletteSymbolId = null;
    this.ClearReelingSearchMarkers();
  }

  private ApplySelectedSymbolToLineCells() {
    // Clear previous line-lock markers.
    for (const c of this.m_lineLockedCells.Values()) {
      this.SetReelingSearchSymbolAt(c.reelId, c.rowId, ANY);
    }
    this.m_lineLockedCells.Clear();

    if (this.m_lineSelectedSymbol === null) {
      return;
    }

    for (const c of this.m_linePaletteCells.Values()) {
      const reel = this.m_reels[c.reelId];
      reel.SetVisibleSymbolAt(c.rowId, this.m_lineSelectedSymbol);
      this.SetReelingSearchSymbolAt(c.reelId, c.rowId, this.m_lineSelectedSymbol);
      this.m_lineLockedCells.Insert(c);
    }
  }

  /** ImGuiDraw: a frame of the screen's steps, with a click of one of them. */
  Draw(click: SubscreenClick | null = null): SubscreenView {
    const reeling = this.ImGuiDrawReelingPhase(click);

    const transform = this.ImGuiDrawReelingPhaseTransformationStep(click);

    const holdAndSpin = this.ImGuiDrawHoldAndSpinPhase(click);

    return { reeling, transform, holdAndSpin };
  }

  Update(copyFrom: RngToolReelRoundSubscreen | null) {
    this.ClearOverlaySymbols();

    this.CopySymbolsFrom(copyFrom);

    this.SetStickSymbols();
  }

  private ImGuiDrawReelingPhase(click: SubscreenClick | null): ReelingPhaseView {
    const reelsCount = this.m_reels.length;
    const rowsCount = this.m_reelConfig!.rowsCount;
    const stickSymbol = this.m_reelConfig!.stickSymbolsConfig.symbolId;

    if (this.m_context!.m_mathRules!.HasReelRoundRules(this.m_type)) {
      const maxLineDisplay = this.m_reelConfig!.lineConfig.lines.length;
      const clamped = Math.min(Math.max(this.m_lineNumberDisplay, 0), maxLineDisplay);
      if (clamped !== this.m_lineNumberDisplay) {
        this.m_lineNumberDisplay = clamped;
        this.SyncLinePaletteCellsFromLineNumberDisplay();
      }
    }
    let paylineCells = new CoordinateSet();
    if (this.m_lineNumberDisplay > 0) {
      paylineCells = BuildPaylineCellSet(this.m_reelConfig!.lineConfig.lines, this.m_lineNumberDisplay - 1, reelsCount, rowsCount);
    }
    for (const cell of this.m_linePaletteCells.Values()) {
      if (!paylineCells.Contains(cell)) {
        this.m_linePaletteCells.Erase(cell);
      }
    }

    const view = new SymbolGridViewData();
    {
      // symbols + search
      for (let reelIndex = 0; reelIndex < reelsCount; ++reelIndex) {
        view.m_symbols.push(this.m_reels[reelIndex].GetVisibleSymbols());
        view.m_search.push(this.m_reels[reelIndex].GetSearchSymbols());
      }
      // select
      view.m_select = this.m_select.gridCell;
      view.m_lineSelect = new CoordinateSet(this.m_linePaletteCells.Values());
      // disabled / locked
      for (let reelIndex = 0; reelIndex < reelsCount; ++reelIndex) {
        for (let rowIndex = 0; rowIndex < view.m_symbols[reelIndex].length; ++rowIndex) {
          let isDisabled = this.m_select.paletteSymbolId !== null && this.m_select.paletteSymbolId !== ANY && this.m_select.paletteSymbolId !== stickSymbol;
          if (isDisabled) {
            const states = this.m_reels[reelIndex].GetSymbolsState(rowIndex);
            isDisabled = states.get(this.m_select.paletteSymbolId!) !== SymbolState.EActive;
            if (isDisabled) {
              view.m_locked.Insert(new SymbolGridCoordinates(reelIndex, rowIndex));
            }
          }
        }
      }
    }

    const columnLabels: string[] = [];
    {
      for (let reelIndex = 0; reelIndex < reelsCount; ++reelIndex) {
        columnLabels.push(String(this.m_reels[reelIndex].GetStopIndex()));
      }
    }

    const grid = GridView(view, true, columnLabels, true);

    if (click?.kind === 'reelingUp') {
      this.m_reels[click.reel].MoveToNextStopIndex();
    } else if (click?.kind === 'reelingDown') {
      this.m_reels[click.reel].MoveToPrevStopIndex();
    } else if (click?.kind === 'reelingCell') {
      const cell = click.coord;
      if (this.m_select.paletteSymbolId !== null) {
        const reelIndex = cell.reelId;
        const rowIndex = cell.rowId;
        const selectedSymbolId = this.m_select.paletteSymbolId;

        if (selectedSymbolId === stickSymbol) {
          this.SetStickSearchSymbolAt(reelIndex, rowIndex, selectedSymbolId);
        } else if (selectedSymbolId === ANY || view.m_search[reelIndex][rowIndex] === selectedSymbolId) {
          this.SetReelingSearchSymbolAt(reelIndex, rowIndex, ANY);
          this.SetStickSearchSymbolAt(reelIndex, rowIndex, ANY);
        } else {
          this.SetReelingSearchSymbolAt(reelIndex, rowIndex, selectedSymbolId);
        }
      } else {
        const shiftHeld = click.shift;
        if (shiftHeld && paylineCells.Contains(cell)) {
          if (this.m_linePaletteCells.Contains(cell)) {
            // Unmark clicked line cell and all payline cells to the end of the line.
            for (const lineCell of this.m_linePaletteCells.Values()) {
              if (lineCell.reelId >= cell.reelId) {
                this.m_linePaletteCells.Erase(lineCell);
              }
            }
          } else {
            for (const paylineCell of paylineCells.Values()) {
              if (paylineCell.reelId <= cell.reelId) {
                this.m_linePaletteCells.Insert(paylineCell);
              }
            }
          }
          this.ApplySelectedSymbolToLineCells();
        } else if (!shiftHeld) {
          if (this.m_select.gridCell !== null && this.m_select.gridCell.equals(cell)) {
            this.m_select.gridCell = null;
          } else {
            this.m_select.gridCell = new SymbolGridCoordinates(cell.reelId, cell.rowId);
          }
        }
      }
    }

    // there are 3 palette-behaviors
    let palette: SymbolPaletteView;
    const paletteClick = click?.kind === 'reelingPalette' ? click.symbolId : null;
    if (this.m_select.gridCell !== null) {
      // prepare supported symbols
      const { reelId: searchReelId, rowId: searchRowId } = this.m_select.gridCell;
      const searchReel = this.m_reels[searchReelId];
      const supportedSymbolsState = searchReel.GetSymbolsState(searchRowId);
      supportedSymbolsState.set(ANY, SymbolState.EActive);

      const searchedPaletteSymbol = searchReel.GetSearchSymbols()[searchRowId];
      palette = PaletteView(RngToolReel.DEFAULT_SELECTED_SYMBOL, searchedPaletteSymbol, supportedSymbolsState, true);
      if (paletteClick !== null) {
        if (searchedPaletteSymbol === paletteClick) {
          searchReel.MoveToNextStopIndex();
        } else {
          this.SetReelingSearchSymbolAt(searchReelId, searchRowId, paletteClick);
        }
      }
    } else if (this.m_linePaletteCells.Size()) {
      const supportedSymbolsState = MergeLineCellsSymbolStates(this.m_linePaletteCells, this.m_reels);
      const selectedLinePaletteSymbol = this.m_lineSelectedSymbol ?? RngToolReel.DEFAULT_SELECTED_SYMBOL;
      palette = PaletteView(selectedLinePaletteSymbol, null, supportedSymbolsState, true);
      if (paletteClick !== null) {
        if (this.m_lineSelectedSymbol !== null && this.m_lineSelectedSymbol === paletteClick) {
          this.m_lineSelectedSymbol = null;
        } else {
          this.m_lineSelectedSymbol = paletteClick;
        }
        this.ApplySelectedSymbolToLineCells();
      }
    } else {
      // prepare supported symbols
      const supportedSymbolsState = new Map<SymbolId, SymbolState>();
      for (const reel of this.m_reels) {
        for (const sym of reel.GetAllSymbols()) {
          supportedSymbolsState.set(sym, SymbolState.EActive);
        }
      }
      if (stickSymbol !== -1) {
        supportedSymbolsState.set(stickSymbol, SymbolState.EActive);
      }
      supportedSymbolsState.set(ANY, SymbolState.EActive);

      const selectedPaletteSymbol = this.m_select.paletteSymbolId ?? RngToolReel.DEFAULT_SELECTED_SYMBOL;
      palette = PaletteView(selectedPaletteSymbol, null, supportedSymbolsState, true);
      if (paletteClick !== null) {
        if (this.m_select.paletteSymbolId !== null && this.m_select.paletteSymbolId === paletteClick) {
          this.m_select.paletteSymbolId = null;
        } else {
          this.m_select.paletteSymbolId = paletteClick;
        }
      }
    }

    const reelSet = this.ImGuiDrawReelSetIndex(click);
    const lineSet = this.ImGuiDrawLineNumberCtrl(click);

    // transfer the result to m_outcome.reeling
    {
      if (!this.m_outcome.reeling.length) {
        this.m_outcome.reeling = Grid.Create(reelsCount, rowsCount, 0);
      }

      let hasChanges = false;
      for (let reelIndex = 0; reelIndex < reelsCount; ++reelIndex) {
        const visibleSymbols = this.m_reels[reelIndex].GetVisibleSymbols();
        for (let rowIndex = 0; rowIndex < rowsCount; ++rowIndex) {
          const visibleSymbol = visibleSymbols[rowIndex];

          if (this.m_outcome.reeling[reelIndex][rowIndex] !== visibleSymbol) {
            hasChanges = true;
            this.m_outcome.reeling[reelIndex][rowIndex] = visibleSymbol;
          }
        }
      }
      if (hasChanges) {
        this.m_outcome.distributionIndex = null;
        this.m_outcome.transformedReeling = null;
        this.m_outcome.holdAndSpin = [];
      }
    }

    return { grid, palette, reelSet, lineSet };
  }

  private ImGuiDrawLineNumberCtrl(click: SubscreenClick | null): CounterView | null {
    if (this.m_context === null) return null;
    if (this.m_context.m_mathRules === null) return null;
    if (!this.m_context.m_mathRules.HasReelRoundRules(this.m_type)) return null;

    const maxLines = this.m_reelConfig!.lineConfig.lines.length;
    const counter = { label: 'Line Set', value: this.m_lineNumberDisplay, min: 0, max: maxLines };
    if (click?.kind !== 'lineNumber') return counter;

    const value = Math.min(Math.max(click.value, 0), maxLines);
    if (value !== this.m_lineNumberDisplay) {
      this.m_lineNumberDisplay = value;

      this.m_select.gridCell = null;
      this.m_select.paletteSymbolId = null;
      this.ClearReelingSearchMarkers();
      this.SyncLinePaletteCellsFromLineNumberDisplay();
    }
    return { ...counter, value: this.m_lineNumberDisplay };
  }

  private ImGuiDrawReelSetIndex(click: SubscreenClick | null): CounterView | null {
    const weightedReelsSize = this.m_reelConfig!.spinConfig.weightedReels.range.length;
    if (weightedReelsSize <= 1) return null;

    const counter = { label: 'Reel Set', value: this.m_outcome.reelSetIndex ?? 0, min: 0, max: weightedReelsSize - 1 };
    if (click?.kind !== 'reelSet') return counter;

    const value = Math.min(Math.max(click.value, 0), weightedReelsSize - 1);
    if (value !== (this.m_outcome.reelSetIndex ?? 0)) {
      this.m_outcome.reelSetIndex = value;
      this.InitVisualReels();
    }
    return { ...counter, value };
  }

  private ImGuiDrawReelingPhaseTransformationStep(click: SubscreenClick | null): TransformStepView | null {
    const math = this.m_context!.m_mathRules!;
    // 2 pick distribution
    // 3 transform the new symbols
    const isVisible = true; // TODO: manage from the math rules - are there rules for transformation at all
    if (!isVisible) return null;

    const replaceInputSymbols = RulesHelper.GetSpinReplaceInputSymbols(math, this.m_type, this.m_outcome.distributionIndex ?? 0);
    if (!replaceInputSymbols.size) return null; // there are no symbols to replace from the rules
    const isDisabled = Grid.CountSymbols(this.m_outcome.reeling, replaceInputSymbols) <= 0;
    // distribution selection - low, mid, high
    {
      const distributionsCount = RulesHelper.GetDistributionChoicesRange(math, this.m_type);
      if (distributionsCount <= 0) return null;
      if (this.m_outcome.distributionIndex === null) {
        this.m_outcome.distributionIndex = 0;
      }
      let selectedIndex = this.m_outcome.distributionIndex;

      // update only when needed
      if (this.m_distributionsList.length !== distributionsCount) {
        this.m_distributionsList = [];
        for (let i = 0; i < distributionsCount; ++i) {
          this.m_distributionsList.push(`Distribution #${i + 1}`);
        }
      }
      if (click?.kind === 'distribution' && !isDisabled) {
        selectedIndex = click.index;
      }
      if (this.m_outcome.distributionIndex !== selectedIndex) {
        this.m_outcome.distributionIndex = selectedIndex;

        this.m_outcome.transformedReeling = null;
        this.m_outcome.holdAndSpin = [];
      }
    }

    // init the result the first time
    if (this.m_outcome.transformedReeling === null) {
      this.m_outcome.transformedReeling = Grid.Copy(this.m_outcome.reeling);
    }

    console.assert(replaceInputSymbols.size === 1);

    const distributionIndex = this.m_outcome.distributionIndex;
    const inputSymbol = [...replaceInputSymbols][0];
    const repetition = this.m_reelConfig!.spinConfig.replaceMaps.repetition;
    const replaceOutputSymbols = RulesHelper.GetSpinReplacedOutputSymbols(math, this.m_type, distributionIndex, inputSymbol);
    const reels = this.m_outcome.transformedReeling;

    const view = SymbolGridViewData.Create(reels); // sym + search
    {
      // select
      view.m_select = this.m_selectTransform.gridCell;

      // search + locked
      Grid.ForEachCell(view.m_symbols, (reelIndex, rowIndex) => {
        const sym = view.m_symbols[reelIndex][rowIndex];
        const isReplaced = replaceOutputSymbols.has(sym);
        if (isReplaced) {
          // search
          view.m_search[reelIndex][rowIndex] = sym;
        }
        const isCoin = replaceInputSymbols.has(sym) || isReplaced;
        if (!isCoin) {
          view.m_locked.Insert(new SymbolGridCoordinates(reelIndex, rowIndex));
        }
      });
    }

    const searchSymFrequencies = Grid.GetSymFrequencies(view.m_search);
    const weightedReplaceSymbols = this.m_reelConfig!.spinConfig.replaceMaps.range[distributionIndex].value.get(inputSymbol)!;
    // additional lock condition -  the symbols can run out of stock
    if (repetition && this.m_selectTransform.paletteSymbolId !== null) {
      const selectedSymId = this.m_selectTransform.paletteSymbolId;
      const isRunOutOfSym = (sym: SymbolId) => (searchSymFrequencies.get(sym) ?? 0) >= SymbolWeight(weightedReplaceSymbols, sym);
      if (isRunOutOfSym(selectedSymId)) {
        // lock all cells with value different fromthe selected
        Grid.ForEachCell(view.m_symbols, (reelIndex, rowIndex) => {
          if (view.m_symbols[reelIndex][rowIndex] !== selectedSymId) {
            view.m_locked.Insert(new SymbolGridCoordinates(reelIndex, rowIndex));
          }
        });
      }
    }

    // prepare supported symbols
    const supportedSymbolsState = new Map<SymbolId, SymbolState>();
    for (const replacedSym of weightedReplaceSymbols.range) {
      const isRunOutOfSym = replacedSym.weight <= (searchSymFrequencies.get(replacedSym.value) ?? 0);
      const isSymActive = repetition ? !isRunOutOfSym : true;
      supportedSymbolsState.set(replacedSym.value, isSymActive ? SymbolState.EActive : SymbolState.EInactive);
    }

    const grid = GridView(view, false, [], !isDisabled);
    if (click?.kind === 'transformCell' && !isDisabled) {
      // cell is clicked
      const cell = click.coord;
      if (this.m_selectTransform.paletteSymbolId !== null) {
        const selectedSymbolId = this.m_selectTransform.paletteSymbolId;
        if (selectedSymbolId === ANY || view.m_search[cell.reelId][cell.rowId] === selectedSymbolId) {
          view.m_search[cell.reelId][cell.rowId] = ANY;
        } else {
          view.m_search[cell.reelId][cell.rowId] = selectedSymbolId;
        }
      } else if (this.m_selectTransform.gridCell !== null && this.m_selectTransform.gridCell.equals(cell)) {
        this.m_selectTransform.gridCell = null;
      } else {
        this.m_selectTransform.gridCell = new SymbolGridCoordinates(cell.reelId, cell.rowId);
      }
    }

    // there are 2 palette-behaviors
    let palette: SymbolPaletteView;
    const paletteClick = click?.kind === 'transformPalette' && !isDisabled ? click.symbolId : null;
    if (this.m_selectTransform.gridCell !== null) {
      // prepare supported symbols
      const { reelId: searchReelId, rowId: searchRowId } = this.m_selectTransform.gridCell;

      const selectedPaletteSymbol = this.m_selectTransform.paletteSymbolId ?? RngToolReel.DEFAULT_SELECTED_SYMBOL;
      const searchedPaletteSymbol = view.m_search[searchReelId][searchRowId];
      palette = PaletteView(selectedPaletteSymbol, searchedPaletteSymbol, supportedSymbolsState, !isDisabled);
      if (paletteClick !== null) {
        if (searchedPaletteSymbol === paletteClick) {
          view.m_search[searchReelId][searchRowId] = ANY;
        } else {
          view.m_search[searchReelId][searchRowId] = paletteClick;
        }
      }
    } else {
      const selectedPaletteSymbol = this.m_selectTransform.paletteSymbolId ?? RngToolReel.DEFAULT_SELECTED_SYMBOL;
      palette = PaletteView(selectedPaletteSymbol, null, supportedSymbolsState, !isDisabled);
      if (paletteClick !== null) {
        if (this.m_selectTransform.paletteSymbolId !== null && this.m_selectTransform.paletteSymbolId === paletteClick) {
          this.m_selectTransform.paletteSymbolId = null;
        } else {
          this.m_selectTransform.paletteSymbolId = paletteClick;
        }
      }
    }

    // merge to alter the outcome
    {
      this.m_outcome.transformedReeling = view.m_symbols;
      // update with the search matrix
      const hasChanges = Grid.ApplyDiff(this.m_outcome.transformedReeling, view.m_search, new Set([ANY]));
      if (hasChanges) {
        this.m_outcome.holdAndSpin = [];
      }
    }

    return { isEnabled: !isDisabled, distributions: [...this.m_distributionsList], distributionIndex, grid, palette };
  }

  private ImGuiDrawHoldAndSpinPhase(click: SubscreenClick | null): HoldAndSpinPhaseView | null {
    // HOLD & SPIN  <<  k / N  >>
    // 1 draw the new positions with coin
    // 2 transform the new symbols

    const isVisible = true; // TODO: manage from the math rules - are there rules for transformation at all
    if (!isVisible) return null;

    const math = this.m_context!.m_mathRules!;
    if (!math.HasHoldAndSpinRules(this.m_type)) return null;
    const reelRules = math.GetHoldAndSpinRoundRules(this.m_type);
    const holdAndSpinRulesConfig = reelRules.GetConfig();

    const triggerSymbolCount = holdAndSpinRulesConfig.triggerSymbolCount;
    if (this.m_outcome.distributionIndex === null) return null;
    const distributionIndex = this.m_outcome.distributionIndex;
    const replaceInputSymbols = RulesHelper.GetHoldAndSpinReplaceInputSymbols(math, this.m_type, distributionIndex);
    const isDisabled = Grid.CountSymbols(this.m_outcome.reeling, replaceInputSymbols) < triggerSymbolCount;

    if (this.m_outcome.transformedReeling === null) return null;

    // init the result the first time
    if (!this.m_outcome.holdAndSpin.length && !isDisabled) {
      const prevReeling = this.m_outcome.transformedReeling;
      this.m_outcome.holdAndSpin = [Grid.Copy(prevReeling), Grid.Copy(prevReeling), Grid.Copy(prevReeling)];
      holdAndSpinPhaseIndex = 0;
    }

    if (!this.m_outcome.holdAndSpin.length) {
      // "Hold & Spin is NOT triggered"
      return { triggered: false };
    }

    {
      const oldPhaseIndex = holdAndSpinPhaseIndex;
      const holdAndSpinMaxIndex = this.m_outcome.holdAndSpin.length - 1;
      if (click?.kind === 'holdAndSpinPhase' && !isDisabled) {
        if (click.delta < 0 && holdAndSpinPhaseIndex !== 0) holdAndSpinPhaseIndex--;
        if (click.delta > 0 && holdAndSpinPhaseIndex !== holdAndSpinMaxIndex) holdAndSpinPhaseIndex++;
      }

      holdAndSpinPhaseIndex = Math.min(Math.max(holdAndSpinPhaseIndex, 0), holdAndSpinMaxIndex);
      if (oldPhaseIndex !== holdAndSpinPhaseIndex) {
        this.m_selectHoldAndSpin.gridCell = null;
        this.m_selectHoldAndSpin.paletteSymbolId = null;
      }
    }

    const phaseIndex = holdAndSpinPhaseIndex;
    const currentOutcome = this.m_outcome.holdAndSpin[phaseIndex];
    const previousOutcome = phaseIndex === 0 ? this.m_outcome.transformedReeling : this.m_outcome.holdAndSpin[phaseIndex - 1];

    const tmp = Grid.Copy(currentOutcome);
    const drawn = DrawHoldAndSpinReels(
      this.m_selectHoldAndSpin,
      currentOutcome,
      previousOutcome,
      this.m_outcome.transformedReeling,
      this.m_context!,
      this.m_type,
      distributionIndex,
      !isDisabled,
      isDisabled ? null : click,
    );
    this.m_outcome.holdAndSpin[phaseIndex] = drawn.outcome;

    const hasChangedOutcome = !Grid.CompareEqual(drawn.outcome, tmp);
    if (hasChangedOutcome) {
      // when expanding, assign the value to currentOutcome
      const holdAndSpin = this.m_outcome.holdAndSpin.slice(0, phaseIndex + 1 + 3);
      while (holdAndSpin.length < phaseIndex + 1 + 3) holdAndSpin.push(Grid.Copy(tmp));
      for (let lastK = phaseIndex + 1; lastK < holdAndSpin.length; ++lastK) {
        holdAndSpin[lastK] = Grid.Copy(holdAndSpin[phaseIndex]);
      }
      this.m_outcome.holdAndSpin = holdAndSpin;
    }

    return {
      triggered: true, isEnabled: !isDisabled, phaseIndex: holdAndSpinPhaseIndex, phaseCount: this.m_outcome.holdAndSpin.length,
      grid: drawn.grid, palette: drawn.palette,
    };
  }

  GetRngOperationsForVisibleOutcome(): RngToolQueue {
    const rngsQueue: RngToolQueue = [];
    const math = this.m_context!.m_mathRules!;
    const reelSetIndex = this.m_outcome.reelSetIndex ?? 0;
    const hasReplacedSymbols = this.m_outcome.transformedReeling !== null && this.m_outcome.distributionIndex !== null;

    const reelIndexes = this.m_reels.map(reel => reel.GetStopIndex());

    const codePerReel = this.m_reels.map(reel => reel.GetStickSymbolPatch());

    if (this.m_type === RoundType.Tetra) {
      const rngsReeling = ResultToRng.GenerateFromSubScreenStops(this.m_subscreenIdx, reelSetIndex, reelIndexes, math, this.m_type);
      rngsReeling.data.push(...ResultToRng.GenerateFromStickSymbols(this.m_subscreenIdx, codePerReel, math, this.m_type).data);
      rngsQueue.push([this.m_type, rngsReeling]);
    } else if (hasReplacedSymbols) {
      const rngsReeling = ResultToRng.GenerateFromSpinStops(
        reelSetIndex,
        reelIndexes,
        this.m_outcome.transformedReeling!,
        math,
        this.m_type,
        this.m_outcome.distributionIndex!,
      );
      rngsQueue.push([this.m_type, rngsReeling]);
    } else {
      const rngsReeling = ResultToRng.GenerateFromSpinStops(reelSetIndex, reelIndexes, [], math, this.m_type);
      rngsQueue.push([this.m_type, rngsReeling]);
    }

    // hold & spin rngs
    if (this.m_outcome.holdAndSpin.length) {
      const distributionIndex = this.m_outcome.distributionIndex!;
      const trigger = this.m_outcome.transformedReeling!;
      for (let index = 0; index < this.m_outcome.holdAndSpin.length; ++index) {
        const holdAndSpin = this.m_outcome.holdAndSpin[index];
        const prev = index === 0 ? trigger : this.m_outcome.holdAndSpin[index - 1];
        const rngsHoldAndSpin: RngSequence = ResultToRng.GenerateFromHoldAndSpin(holdAndSpin, prev, trigger, math, this.m_type, distributionIndex);
        rngsQueue.push([RoundType.HoldAndSpin, rngsHoldAndSpin]);
      }
    }

    return rngsQueue;
  }

  GetNoWinLikePresetName() {
    const makeToken = (symbolName: string) => {
      if (!symbolName) {
        return '__';
      }

      let token = symbolName.slice(0, Math.min(2, symbolName.length));
      token = token[0].toUpperCase() + (token.length > 1 ? token[1].toLowerCase() : '');

      return token;
    };

    const makeTokenFromSymbolId = (symbolId: SymbolId) => {
      if (symbolId === ANY) {
        return 'Wd';
      }

      const [gotName, symbolName] = this.m_context?.m_callbacks.symbolNameGetter?.(this.m_type, symbolId) ?? [false, ''];
      if (!gotName) {
        return '__';
      }

      return makeToken(symbolName);
    };

    const sourceGrid = this.m_outcome.transformedReeling ?? this.m_outcome.reeling;
    if (!sourceGrid.length || !sourceGrid[0].length) {
      return '';
    }

    const middleRowIndex = Math.trunc(sourceGrid[0].length / 2);
    let result = '';
    for (let reelIndex = 0; reelIndex < sourceGrid.length; ++reelIndex) {
      const reel = sourceGrid[reelIndex];
      let token = '';

      // Prioritize explicitly selected symbols for this reel.
      // If multiple are selected, use the first selected by click order.
      if (reelIndex < this.m_reels.length) {
        let firstClickOrder = 0;
        let firstCell: SymbolGridCoordinates | null = null;
        for (const { coord, order: clickOrder } of this.m_reelingSelectionOrder.values()) {
          if (coord.reelId !== reelIndex) {
            continue;
          }

          if (firstCell === null || clickOrder < firstClickOrder) {
            firstClickOrder = clickOrder;
            firstCell = coord;
          }
        }

        if (firstCell !== null) {
          const searchSymbols = this.m_reels[reelIndex].GetSearchSymbols();
          const rowId = firstCell.rowId;
          if (rowId >= 0 && rowId < searchSymbols.length) {
            token = makeTokenFromSymbolId(searchSymbols[rowId]);
          }
        }
      }

      // Fallback to middle row symbol when there is no explicit selection for the reel.
      if (!token && middleRowIndex < reel.length) {
        token = makeTokenFromSymbolId(reel[middleRowIndex]);
      }

      if (!token) {
        token = '__';
      }

      if (result) {
        result += '-';
      }
      result += token;
    }

    return result;
  }

  private InitVisualReels() {
    const reelRules = this.m_context!.m_mathRules!.GetReelRoundRules(this.m_type);
    const firstRowOffset = -Math.trunc(reelRules.GetRowsCount() / 2);
    const reelsCount = reelRules.GetReelsCount();
    const rowsCount = reelRules.GetRowsCount();
    while (this.m_reels.length < reelsCount) this.m_reels.push(new RngToolReel());
    this.m_reels.length = reelsCount;

    const weightedReels = this.m_reelConfig!.spinConfig.weightedReels.range;
    console.assert((this.m_outcome.reelSetIndex ?? 0) < weightedReels.length);

    const spinReels = weightedReels[this.m_outcome.reelSetIndex ?? 0].value;
    console.assert(reelsCount === spinReels.length); // some mismatch

    for (let reelIndex = 0; reelIndex < this.m_reels.length; ++reelIndex) {
      const newReel = this.m_reels[reelIndex];
      const spinReel: SymbolIds = spinReels[reelIndex];
      newReel.Init(spinReel, rowsCount, firstRowOffset);
    }
  }

  private SetReelingSearchSymbolAt(reelId: number, rowId: number, symbolId: SymbolId) {
    const reel = this.m_reels[reelId];
    reel.SetSearchSymbolAt(rowId, symbolId);

    const coord = new SymbolGridCoordinates(reelId, rowId);
    if (symbolId === ANY) {
      this.m_reelingSelectionOrder.delete(coord.key());
      return;
    }

    if (!this.m_reelingSelectionOrder.has(coord.key())) {
      this.m_reelingSelectionOrder.set(coord.key(), { coord, order: this.m_reelingSelectionOrderCounter++ });
    }
  }

  private SetStickSearchSymbolAt(reelId: number, rowId: number, symbolId: SymbolId) {
    const stickSymbolId = this.m_reelConfig!.stickSymbolsConfig.symbolId;
    if (stickSymbolId === -1) return;

    const reel = this.m_reels[reelId];
    const prevValue = reel.GetStickValue(rowId);
    const value = symbolId === stickSymbolId ? !prevValue : false;
    reel.SetStickValue(rowId, value);

    // check if the stick symbol is valid
    const patchId = reel.GetStickSymbolPatch();
    const distr = this.m_reelConfig!.stickSymbolsConfig.distrPerReel[reelId];
    const it = distr.range.find(w => w.value === patchId);

    if (!it || it.weight === 0) {
      reel.SetStickValue(rowId, prevValue);
    }
  }

  private ClearReelingSelectionOrder() {
    this.m_reelingSelectionOrder.clear();
    this.m_reelingSelectionOrderCounter = 1;
  }

  private ClearOverlaySymbols() {
    for (const reel of this.m_reels) {
      for (let rowId = 0; rowId < this.m_reelConfig!.rowsCount; rowId++) {
        reel.SetOverlaySymbolAt(rowId, ANY);
      }
    }
  }

  private CopySymbolsFrom(copyFrom: RngToolReelRoundSubscreen | null) {
    if (copyFrom === null) return;

    const copySymbolIds = this.m_reelConfig!.copySymbolsConfig.symbolIds;
    if (!copySymbolIds.length) return;

    for (let reelId = 0; reelId < this.m_reels.length; reelId++) {
      if (!(reelId < copyFrom.m_reels.length)) continue;
      const visibleSymbols = copyFrom.m_reels[reelId].GetVisibleSymbols();

      for (let rowId = 0; rowId < visibleSymbols.length; rowId++) {
        if (copySymbolIds.includes(visibleSymbols[rowId])) {
          this.m_reels[reelId].SetOverlaySymbolAt(rowId, visibleSymbols[rowId]);
        }
      }
    }
  }

  private SetStickSymbols() {
    const stickSymbolId = this.m_reelConfig!.stickSymbolsConfig.symbolId;
    if (stickSymbolId === -1) return;

    for (const reel of this.m_reels) {
      for (let rowId = 0; rowId < this.m_reelConfig!.rowsCount; rowId++) {
        if (reel.GetStickValue(rowId)) {
          reel.SetOverlaySymbolAt(rowId, stickSymbolId);
        }
      }
    }
  }
}
