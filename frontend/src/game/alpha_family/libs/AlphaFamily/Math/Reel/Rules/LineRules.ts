// Egt::Game::AlphaFamily::LineRules (AlphaFamily/Math/Reel/Rules/LineRules.h/.cpp): left to right line combinations
// with wilds.

import { CombinationType, type Line, type SymbolGrid, SymbolGridCoordinates, type SymbolId, SymbolViewInfo } from '../../Common/Common.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import { ReelCombination, SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { LineRulesConfig, WildSymbol } from './LineRules.data';

export class LineRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: LineRulesConfig) {
    super(roundRules);
  }

  GetLineOffsets(): Line[];
  GetLineOffsets(lineId: number): Line;
  GetLineOffsets(lineId?: number) {
    if (lineId === undefined) return this.m_config.lines;
    const line = this.m_config.lines[lineId];
    if (!line) throw new Error(`Line ${lineId} does not exist`);
    return line;
  }

  IsWild(symbolId: SymbolId) {
    return this.GetWildSymbol(symbolId) !== null;
  }

  GetWildSymbol(symbolId: SymbolId): WildSymbol | null {
    return this.m_config.wildSymbols.find(wild => wild.symbolId === symbolId) ?? null;
  }

  CanWildReplaceTarget(wild: WildSymbol | SymbolId, target: SymbolId): boolean {
    const symbol = typeof wild === 'number' ? this.GetWildSymbol(wild) : wild;
    if (!symbol) return false;
    if (symbol.include.size) return symbol.include.has(target);
    if (symbol.exclude.size) return !symbol.exclude.has(target);
    return true;
  }

  ImproveSymbolCount(combination: ReelCombination, stop: SymbolGrid, line: Line, checkForNewWilds: boolean) {
    for (let nextReel = combination.symbolCount; nextReel < line.length; ++nextReel) {
      const nextSymbolId = BaseReelRules.GetLineSymbol(stop, line, nextReel);
      if (combination.wildIds.has(nextSymbolId)) {
        ++combination.wildCount;
        ++combination.symbolCount;
      } else if (nextSymbolId === combination.symbolId) {
        ++combination.symbolCount;
      } else if (checkForNewWilds && this.CanWildReplaceTarget(nextSymbolId, combination.symbolId)) {
        combination.wildIds.add(nextSymbolId);
        ++combination.wildCount;
        ++combination.symbolCount;
      } else {
        break;
      }
    }
  }

  IterateCombinationRecursive(combination: ReelCombination, phase: SpinReelsPhase, line: Line) {
    /// Improve symbol count, without checking for new wilds
    this.ImproveSymbolCount(combination, phase.stop, line, false);
    /// Check if combination can be further improved
    if (combination.symbolCount < line.length) {
      /// Check if this is a wild symbol combination
      const wild = this.GetWildSymbol(combination.symbolId);
      if (wild) {
        const nextSymbolId = BaseReelRules.GetLineSymbol(phase.stop, line, combination.symbolCount);
        /// Wild symbol combination may have an alternative using the next symbol
        if (this.CanWildReplaceTarget(wild, nextSymbolId)) {
          const alternative = combination.Clone();
          alternative.symbolId = nextSymbolId;
          ++alternative.symbolCount;
          if (this.IsWild(nextSymbolId)) {
            alternative.wildIds.add(nextSymbolId);
            ++alternative.wildCount;
          }
          this.IterateCombinationRecursive(alternative, phase, line);
        }
      }
      /// Improve combination with new wilds
      this.ImproveSymbolCount(combination, phase.stop, line, true);
    }
    /// Check if this is a non-winning combination
    if (combination.HasPayout(this.m_config.linePayTables)) {
      this.FillSymbolViewInfo(phase.stop, combination);
      phase.combinations.push(combination);
    }
  }

  CreateCombinations(context: Context, spinPhase: SpinReelsPhase) {
    const input = context.input;
    for (let lineId = 0; lineId < input.lines; ++lineId) {
      const line = this.GetRoundRules().GetLineOffsets(lineId);
      const combination = new ReelCombination();
      combination.type = CombinationType.LeftToRight;
      combination.id = lineId;
      combination.bet = input.betPerLine;
      combination.symbolId = BaseReelRules.GetLineSymbol(spinPhase.stop, line, 0);
      combination.symbolCount = 1;
      if (this.IsWild(combination.symbolId)) {
        combination.wildIds.add(combination.symbolId);
        ++combination.wildCount;
      }
      this.IterateCombinationRecursive(combination, spinPhase, line);
    }
  }

  AddMultipliers(phase: SpinReelsPhase) {
    for (const combination of phase.combinations) {
      for (const wildId of combination.wildIds) {
        const wild = this.GetWildSymbol(wildId);
        if (wild) combination.multipliers.MultiplyBy(wild.multipliers);
      }
    }
  }

  RewardCombinations(phase: SpinReelsPhase) {
    for (const combination of phase.combinations) {
      if (combination.type === CombinationType.LeftToRight) combination.AddRewardsFrom(this.m_config.linePayTables);
    }
  }

  FillSymbolViewInfo(stop: SymbolGrid, combination: ReelCombination) {
    if (combination.type !== CombinationType.LeftToRight) return;
    const line = this.GetLineOffsets(combination.id);
    for (let reelId = 0; reelId < combination.symbolCount; ++reelId) {
      const rowId = line[reelId];
      combination.symbolViewInfos.push(new SymbolViewInfo(stop[reelId][rowId], new SymbolGridCoordinates(reelId, rowId)));
    }
  }
}
