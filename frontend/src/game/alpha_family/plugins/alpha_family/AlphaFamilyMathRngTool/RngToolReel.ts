// Egt::Game::AlphaFamily::RngToolReel (AlphaFamilyMathRngTool/RngToolReel.h/.cpp): a reel of the RNG Picker, its stop
// on the reel's strip and the symbols it shows. A search pattern (a symbol per row, or any) limits the stops it can
// move to; an overlay shows symbols over the strip's (copied or sticky ones); sticky rows make its stick symbol patch.

import type { SymbolId, SymbolIds } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';

export enum SymbolState {
  EInactive = 0,
  EActive = 1,
}

/** The first index whose value is not less than the value (std::lower_bound), or the length. */
function LowerBound(values: number[], value: number) {
  let low = 0;
  let high = values.length;
  while (low < high) {
    const middle = (low + high) >> 1;
    if (values[middle] < value) low = middle + 1;
    else high = middle;
  }
  return low;
}

export class RngToolReel {
  static readonly SEARCH_ANY_SYMBOL: SymbolId = 255;
  static readonly DEFAULT_SELECTED_SYMBOL: SymbolId = -100;

  private m_searchPattern: SymbolIds = []; // -1 is wild card
  private m_spinSymbols: SymbolIds = [];
  private m_rowsCount = 0;
  private m_firstRowStopIndexOffset = 0;
  private m_stopIndex = 0;

  private m_overlay: SymbolIds = [];
  private m_stickSymbols: boolean[] = [];

  // cached search info
  private m_allStopIndexes: number[] = [];

  Init(spinSyms: SymbolIds, rowsCount: number, firstRowStopIndexOffset: number) {
    this.m_stopIndex = 0;
    this.m_spinSymbols = spinSyms;
    this.m_rowsCount = rowsCount;
    this.m_firstRowStopIndexOffset = firstRowStopIndexOffset;
    this.m_overlay = [];
    this.m_stickSymbols = [];
    this.m_searchPattern = [];

    const defaultSearchPattern = new Array<SymbolId>(this.m_rowsCount).fill(RngToolReel.SEARCH_ANY_SYMBOL);
    this.SetSearchSymbols(defaultSearchPattern);
  }

  Deinit() {
    this.m_spinSymbols = [];
    this.m_searchPattern = [];
    this.m_overlay = [];
    this.m_stickSymbols = [];
    this.m_rowsCount = 0;
    this.m_stopIndex = 0;
    this.m_firstRowStopIndexOffset = 0;
  }

  MoveToClosestValidStopIndex() {
    const closestStopIndex = this.m_stopIndex;
    if (this.m_allStopIndexes.length) {
      const it = LowerBound(this.m_allStopIndexes, closestStopIndex);
      const newStopIndex = it !== this.m_allStopIndexes.length ? this.m_allStopIndexes[it] : this.m_allStopIndexes[0];
      this.SetStopIndex(newStopIndex);
    }
  }

  MoveToNextStopIndex() {
    const nextStopIndex = this.GetCyclicIndex(this.m_stopIndex + 1);
    if (this.m_allStopIndexes.length) {
      const it = LowerBound(this.m_allStopIndexes, nextStopIndex);
      const newStopIndex = it !== this.m_allStopIndexes.length ? this.m_allStopIndexes[it] : this.m_allStopIndexes[0];
      this.SetStopIndex(newStopIndex);
    }
  }

  MoveToPrevStopIndex() {
    if (this.m_allStopIndexes.length) {
      const it = LowerBound(this.m_allStopIndexes, this.m_stopIndex);
      const newStopIndex = it !== 0 ? this.m_allStopIndexes[it - 1] : this.m_allStopIndexes[this.m_allStopIndexes.length - 1];
      this.SetStopIndex(newStopIndex);
    }
  }

  SetStopIndex(newStopIndex: number) {
    if (this.m_stopIndex === newStopIndex) {
      return;
    }
    console.assert(this.m_stopIndex >= 0 && this.m_stopIndex < this.GetReelSize());
    this.m_stopIndex = newStopIndex;
    this.OnStopIndexChanged();
  }

  GetVisibleSymbols(): SymbolIds {
    const visibleSymbols: SymbolIds = new Array<SymbolId>(this.m_rowsCount).fill(0);

    for (let row = 0; row < this.m_rowsCount; ++row) {
      if (row < this.m_overlay.length && this.m_overlay[row] !== RngToolReel.SEARCH_ANY_SYMBOL) {
        visibleSymbols[row] = this.m_overlay[row];
      } else {
        const indexForRow = this.GetIndexForRow(row);
        visibleSymbols[row] = this.m_spinSymbols[indexForRow];
      }
    }

    return visibleSymbols;
  }

  GetAllSymbols(): SymbolIds {
    return this.m_spinSymbols;
  }

  GetStopIndex() {
    return this.m_stopIndex;
  }

  GetSize() {
    return this.m_spinSymbols.length;
  }

  SetVisibleSymbolAt(row: number, symbol: SymbolId) {
    if (row < 0 || row >= this.m_rowsCount || !this.m_spinSymbols.length) {
      return false;
    }

    let foundStopIndex = -1;
    for (let step = 0; step < this.GetReelSize(); ++step) {
      const stopIndex = this.GetCyclicIndex(this.m_stopIndex + step);
      const rowIndex = this.GetIndexForRowFrom(row, stopIndex);
      if (this.m_spinSymbols[rowIndex] === symbol) {
        foundStopIndex = stopIndex;
        break;
      }
    }

    if (foundStopIndex < 0) {
      return false;
    }

    this.SetStopIndex(foundStopIndex);
    return true;
  }

  SetSearchSymbolAt(row: number, symbol: SymbolId) {
    console.assert(row >= 0 && row < this.m_searchPattern.length);
    if (this.m_searchPattern[row] === symbol) {
      return;
    }
    this.m_searchPattern[row] = symbol;
    this.SearchSymbolsChanged();
  }

  SetSearchSymbols(symbols: SymbolIds) {
    if (this.m_searchPattern.length === symbols.length && this.m_searchPattern.every((symbol, index) => symbol === symbols[index])) {
      return;
    }
    this.m_searchPattern = [...symbols];
    this.SearchSymbolsChanged();
  }

  GetSearchSymbols(): SymbolIds {
    return [...this.m_searchPattern];
  }

  /** Which symbols the row can show, with the other rows' search kept (C++'s std::map: by symbol id). */
  GetSymbolsState(row: number): Map<SymbolId, SymbolState> {
    const result = new Map<SymbolId, SymbolState>();
    for (const sym of [...this.m_spinSymbols].sort((a, b) => a - b)) {
      result.set(sym, SymbolState.EInactive);
    }
    const expandedSearchPattern = [...this.m_searchPattern];
    expandedSearchPattern[row] = RngToolReel.SEARCH_ANY_SYMBOL;
    const expandedStopIndexes = this.FindAllStopIndexes(expandedSearchPattern);
    for (const validStopIndex of expandedStopIndexes) {
      const rowIndex = this.GetIndexForRowFrom(row, validStopIndex);
      const possibleSym = this.m_spinSymbols[rowIndex];
      result.set(possibleSym, SymbolState.EActive);
    }
    return result;
  }

  SetOverlaySymbolAt(row: number, symbol: SymbolId) {
    if (!this.m_overlay.length) {
      this.m_overlay = new Array<SymbolId>(this.m_rowsCount).fill(RngToolReel.SEARCH_ANY_SYMBOL);
    }

    this.m_overlay[row] = symbol;
  }

  SetStickValue(row: number, value: boolean) {
    if (!this.m_stickSymbols.length) {
      this.m_stickSymbols = new Array<boolean>(this.m_rowsCount).fill(false);
    }

    this.m_stickSymbols[row] = value;
  }

  GetStickValue(row: number) {
    if (!(row >= 0 && row < this.m_stickSymbols.length)) return false;
    return this.m_stickSymbols[row];
  }

  GetStickSymbolPatch() {
    if (!this.m_stickSymbols.length) return 0;

    let bits = 0;

    for (let i = 0; i < this.m_stickSymbols.length; i++) {
      bits |= (this.m_stickSymbols[i] ? 1 : 0) << i;
    }

    const patchmap = [0, 1, 2, 4, 3, 6, 5, 7]; // StickSymbolsRules::StickSymbol()
    if (!(bits >= 0 && bits < patchmap.length)) {
      console.assert(false, 'RngToolReel: a stick symbol patch out of range');
      return 0;
    }

    return patchmap[bits];
  }

  private OnStopIndexChanged() {}

  private GetReelSize() {
    return this.m_spinSymbols.length;
  }

  private GetCyclicIndex(index: number) {
    const reelSize = this.GetReelSize();
    const validIndex = (index + reelSize) % reelSize;
    return validIndex;
  }

  private GetIndexForRow(row: number) {
    return this.GetIndexForRowFrom(row, this.m_stopIndex);
  }

  private GetIndexForRowFrom(row: number, stopIndex: number) {
    const rowIndex = stopIndex + this.m_firstRowStopIndexOffset + row;
    return this.GetCyclicIndex(rowIndex);
  }

  private GetStopIndexFrom(row: number, rowIndex: number) {
    const stopIndex = rowIndex - row - this.m_firstRowStopIndexOffset;
    return this.GetCyclicIndex(stopIndex);
  }

  private SearchSymbolsChanged() {
    this.m_allStopIndexes = this.FindAllStopIndexes(this.m_searchPattern);
    this.MoveToClosestValidStopIndex();
  }

  private FindAllStopIndexes(searchPattern: SymbolIds): number[] {
    const validIndexes: number[] = [];
    let isMatch = true;
    for (let stopIndex = 0; stopIndex < this.GetReelSize(); stopIndex++) {
      isMatch = true;
      // update match
      for (let row = 0; row < this.m_rowsCount; row++) {
        const searchSym = searchPattern[row];
        const currentRowIndex = this.GetIndexForRowFrom(row, stopIndex);
        isMatch &&= searchSym === RngToolReel.SEARCH_ANY_SYMBOL || searchSym === this.m_spinSymbols[currentRowIndex];
      }
      if (isMatch) {
        validIndexes.push(stopIndex);
      }
    }
    return validIndexes;
  }
}
