// Egt::Game::AlphaFamily::RulesHelper (AlphaFamilyMathToolUtils/RulesHelper.h/.cpp): what the RNG tools read of a reel
// round's rules: the reels' symbols and stops, and the symbols a spin's replace maps replace.

import type { RoundType, SymbolGrid, SymbolId, SymbolIds } from '../AlphaFamily/Math/Common/Common.data';
import type { ReelRoundRules } from '../AlphaFamily/Math/Reel/ReelRoundRules';
import type { IMathRules } from '../AlphaFamily/RuntimeExport/IMathRules';

/** std::set<SymbolId>: the values in ascending order. */
export function SymbolSet(values: Iterable<SymbolId>) {
  return new Set([...values].sort((a, b) => a - b));
}

export class RulesHelper {
  // Reeling
  static FindFirstStops(searchGrid: SymbolGrid, wildcardSearchSymbolIds: Set<SymbolId>, math: IMathRules | null, type: RoundType, reelSetIndex: number): number[];
  static FindFirstStops(searchGrid: SymbolGrid, wildcardSearchSymbolIds: Set<SymbolId>, reelRoundRules: ReelRoundRules, reelSetIndex: number): number[];
  static FindFirstStops(searchGrid: SymbolGrid, wildcardSearchSymbolIds: Set<SymbolId>, ...args: [IMathRules | null, RoundType, number] | [ReelRoundRules, number]): number[] {
    if (args.length === 3) {
      const [math, type, reelSetIndex] = args;
      if (!math) return [];
      return RulesHelper.FindFirstStops(searchGrid, wildcardSearchSymbolIds, math.GetReelRoundRules(type), reelSetIndex);
    }
    const [reelRoundRules, reelSetIndex] = args;

    const firstStops: number[] = new Array<number>(searchGrid.length).fill(0);
    for (let reelIndex = 0; reelIndex < searchGrid.length; ++reelIndex) {
      const allStops = RulesHelper.FindAllStopIndexes(reelIndex, searchGrid[reelIndex], wildcardSearchSymbolIds, reelRoundRules, reelSetIndex);
      const stopIndex = allStops.length ? allStops[0] : 0;
      firstStops[reelIndex] = stopIndex;
    }
    return firstStops;
  }

  // based on the RngToolReel
  static FindAllStopIndexes(reelId: number, searchReel: SymbolIds, wildcardSearchSymbolIds: Set<SymbolId>, math: IMathRules | null, type: RoundType, reelSetIndex: number): number[];
  static FindAllStopIndexes(reelId: number, searchReel: SymbolIds, wildcardSearchSymbolIds: Set<SymbolId>, reelRoundRules: ReelRoundRules, reelSetIndex: number): number[];
  static FindAllStopIndexes(reelId: number, searchReel: SymbolIds, wildcardSearchSymbolIds: Set<SymbolId>, ...args: [IMathRules | null, RoundType, number] | [ReelRoundRules, number]): number[] {
    if (args.length === 3) {
      const [math, type, reelSetIndex] = args;
      if (!math) return [];
      return RulesHelper.FindAllStopIndexes(reelId, searchReel, wildcardSearchSymbolIds, math.GetReelRoundRules(type), reelSetIndex);
    }
    const [reelRoundRules, reelSetIndex] = args;

    const validIndexes: number[] = [];
    let isMatch = true;
    const reelSize = RulesHelper.GetReelSize(reelRoundRules, reelSetIndex, reelId);
    for (let stopIndex = 0; stopIndex < reelSize; ++stopIndex) {
      isMatch = true;
      // update match
      const rowsCount = searchReel.length;
      for (let row = 0; row < rowsCount; ++row) {
        const searchSym = searchReel[row];
        const currentRowIndex = RulesHelper.GetIndexForRowFrom(row, stopIndex, reelRoundRules, reelSetIndex, reelId);
        const sym = RulesHelper.GetReelSymbol(reelRoundRules, reelSetIndex, reelId, currentRowIndex);
        isMatch &&= wildcardSearchSymbolIds.has(searchSym) || searchSym === sym;
      }
      if (isMatch) {
        validIndexes.push(stopIndex);
      }
    }
    return validIndexes;
  }

  static GetIndexForRowFrom(row: number, stopIndex: number, math: IMathRules | null, type: RoundType, reelSetIndex: number, reelId: number): number;
  static GetIndexForRowFrom(row: number, stopIndex: number, reelRoundRules: ReelRoundRules, reelSetIndex: number, reelId: number): number;
  static GetIndexForRowFrom(row: number, stopIndex: number, ...args: [IMathRules | null, RoundType, number, number] | [ReelRoundRules, number, number]): number {
    if (args.length === 4) {
      const [math, type, reelSetIndex, reelId] = args;
      if (!math) return 0;
      return RulesHelper.GetIndexForRowFrom(row, stopIndex, math.GetReelRoundRules(type), reelSetIndex, reelId);
    }
    const [reelRoundRules, reelSetIndex, reelId] = args;

    const FIRST_ROW_STOP_INDEX_OFFSET = -Math.trunc(reelRoundRules.GetRowsCount() / 2);
    const rowIndex = stopIndex + FIRST_ROW_STOP_INDEX_OFFSET + row + RulesHelper.GetReelSize(reelRoundRules, reelSetIndex, reelId);
    return RulesHelper.GetCyclicIndex(rowIndex, reelRoundRules, reelSetIndex, reelId);
  }

  static GetReelSymbol(math: IMathRules | null, type: RoundType, reelSetIndex: number, reelId: number, stopIndex: number): SymbolId;
  static GetReelSymbol(reelRoundRules: ReelRoundRules, reelSetIndex: number, reelId: number, stopIndex: number): SymbolId;
  static GetReelSymbol(...args: [IMathRules | null, RoundType, number, number, number] | [ReelRoundRules, number, number, number]): SymbolId {
    if (args.length === 5) {
      const [math, type, reelSetIndex, reelId, stopIndex] = args;
      if (!math) return 0;
      return RulesHelper.GetReelSymbol(math.GetReelRoundRules(type), reelSetIndex, reelId, stopIndex);
    }
    const [reelRoundRules, reelSetIndex, reelId, stopIndex] = args;

    const weightedReels = reelRoundRules.GetSpinRules().GetConfig().weightedReels.range;
    if (!(reelSetIndex >= 0 && reelSetIndex < weightedReels.length)) return 0;
    return weightedReels[reelSetIndex].value[reelId][stopIndex];
  }

  static GetReelSize(math: IMathRules | null, type: RoundType, reelSetIndex: number, reelId: number): number;
  static GetReelSize(reelRoundRules: ReelRoundRules, reelSetIndex: number, reelId: number): number;
  static GetReelSize(...args: [IMathRules | null, RoundType, number, number] | [ReelRoundRules, number, number]): number {
    if (args.length === 4) {
      const [math, type, reelSetIndex, reelId] = args;
      if (!math) return 0;
      return RulesHelper.GetReelSize(math.GetReelRoundRules(type), reelSetIndex, reelId);
    }
    const [reelRoundRules, reelSetIndex, reelId] = args;

    const weightedReels = reelRoundRules.GetSpinRules().GetConfig().weightedReels.range;
    if (!(reelSetIndex >= 0 && reelSetIndex < weightedReels.length)) return 0;
    return weightedReels[reelSetIndex].value[reelId].length;
  }

  static GetCyclicIndex(index: number, math: IMathRules | null, type: RoundType, reelSetIndex: number, reelId: number): number;
  static GetCyclicIndex(index: number, reelRoundRules: ReelRoundRules, reelSetIndex: number, reelId: number): number;
  static GetCyclicIndex(index: number, ...args: [IMathRules | null, RoundType, number, number] | [ReelRoundRules, number, number]): number {
    if (args.length === 4) {
      const [math, type, reelSetIndex, reelId] = args;
      if (!math) return 0;
      return RulesHelper.GetCyclicIndex(index, math.GetReelRoundRules(type), reelSetIndex, reelId);
    }
    const [reelRoundRules, reelSetIndex, reelId] = args;

    const reelSize = RulesHelper.GetReelSize(reelRoundRules, reelSetIndex, reelId);
    if (reelSize === 0) return 0;
    const validIndex = (index + reelSize) % reelSize;
    return validIndex;
  }

  // reel replace
  static GetDistributionChoicesRange(math: IMathRules, type: RoundType) {
    return math.GetReelRoundRules(type).GetSpinRules().GetConfig().replaceMaps.range.length;
  }

  // Replace(InputSymbol) = OutputSymbol
  // all differrent values of InputSymbol
  static GetSpinReplaceInputSymbols(math: IMathRules, type: RoundType, distributionIndex: number): Set<SymbolId> {
    const replaceMapDistributions = math.GetReelRoundRules(type).GetSpinRules().GetConfig().replaceMaps.range;

    if (distributionIndex >= replaceMapDistributions.length) return new Set();
    const replaceMap = replaceMapDistributions[distributionIndex];

    return SymbolSet(replaceMap.value.keys());
  }

  // all differrent values of OutputSymbol
  static GetSpinReplacedOutputSymbols(math: IMathRules, type: RoundType, distributionIndex: number, inputSymbol: SymbolId): Set<SymbolId> {
    const replaceMapDistributions = math.GetReelRoundRules(type).GetSpinRules().GetConfig().replaceMaps.range;

    if (distributionIndex >= replaceMapDistributions.length) return new Set();
    const replaceMap = replaceMapDistributions[distributionIndex];

    return SymbolSet(replaceMap.value.get(inputSymbol)!.range.map(rangeElem => rangeElem.value));
  }

  /// HOLD AND SPIN
  // Replace(InputSymbol) = OutputSymbol
  // all differrent values of InputSymbol
  static GetHoldAndSpinReplaceInputSymbols(math: IMathRules, type: RoundType, distributionIndex: number): Set<SymbolId> {
    const replaceMapDistributions = math.GetHoldAndSpinRoundRules(type).GetConfig().replaceMaps.range;

    if (distributionIndex >= replaceMapDistributions.length) return new Set();
    const replaceMap = replaceMapDistributions[distributionIndex];

    return SymbolSet(replaceMap.value.keys());
  }

  static GetHoldAndSpinReplacedOutputSymbols(math: IMathRules, type: RoundType, distributionIndex: number, inputSymbol: SymbolId): Set<SymbolId> {
    const replaceMapDistributions = math.GetHoldAndSpinRoundRules(type).GetConfig().replaceMaps.range;

    if (distributionIndex >= replaceMapDistributions.length) return new Set();
    const replaceMap = replaceMapDistributions[distributionIndex];

    return SymbolSet(replaceMap.value.get(inputSymbol)!.range.map(rangeElem => rangeElem.value));
  }
}
