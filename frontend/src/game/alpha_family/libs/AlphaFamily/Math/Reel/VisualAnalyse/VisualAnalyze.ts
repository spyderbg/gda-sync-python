// Egt::Game::AlphaFamily::VisualAnalyze (AlphaFamily/Math/Reel/VisualAnalyse/VisualAnalyze.h/.cpp): what a result
// shows besides its math: big win tags, attraction on reels, stacked figures.

import { Currency, ERoundTags, SymbolViewInfo, type SymbolViewInfos, SymbolGridCoordinates } from '../../Common/Common.data';
import type { RoundResult } from '../../RoundResult.data';
import type { ReelCombinations, SpinReelsPhase } from '../ReelRoundPhase.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import { VisualAnalyzeConfig } from './VisualAnalyze.data';

export class VisualAnalyze {
  constructor(private readonly m_rules: ReelRoundRules, private readonly m_config: VisualAnalyzeConfig) {}

  GetConfig() {
    return this.m_config;
  }

  GetRoundTags(result: RoundResult): ERoundTags[] {
    const tags: ERoundTags[] = [];
    // big win
    const rewards = result.ForceGetSummaryWithoutRecovery().rewards;
    const reward = Math.max(rewards.Get(Currency.Credits), rewards.Get(Currency.ExtraSpinEnergy), rewards.Get(Currency.CoinsSpinEnergy));
    const bet = result.GetBet() / this.m_rules.GetTetraSpinRules().GetSubScreenCount();
    if (bet === 0) return tags;
    const thresholds = [...this.m_config.winTypeThresholds].sort((a, b) => a[0] - b[0]).filter(([timesBet]) => reward >= timesBet * bet);
    if (thresholds.length) tags.push(thresholds[thresholds.length - 1][1]);
    return tags;
  }

  GetReelTags(phase: SpinReelsPhase, reelId: number, stoppedReelIds: number[]): ERoundTags[] {
    if (stoppedReelIds.includes(reelId)) return [];
    // attraction reel
    let hasAttraction = false;
    for (const [symbol, count] of this.m_config.attractionScatterCount) {
      if (hasAttraction) break;
      const scatterCount = stoppedReelIds.filter(id => phase.initialStop[id].includes(symbol)).length;
      // scatter >= configured count will start attraction to rest of the reels
      hasAttraction = scatterCount >= count;
    }
    for (const [symbol, count] of this.m_config.attractionLineCount) {
      if (hasAttraction) break;
      for (const line of this.m_rules.GetLineRules().GetLineOffsets()) {
        if (hasAttraction) break;
        let symbolCount = 0;
        let combinationFinished = false;
        for (let i = 0, reelingCount = 0; i < phase.initialStop.length; i++) {
          if (stoppedReelIds.includes(i)) {
            if (phase.initialStop[i][line[i]] === symbol) symbolCount++;
            else combinationFinished ||= reelingCount === 0;
          } else {
            reelingCount++;
          }
        }
        // symbol >= configured count and no other stop reels within range
        hasAttraction = symbolCount >= count && !combinationFinished;
      }
    }
    return hasAttraction ? [ERoundTags.Attraction] : [];
  }

  /** The stacks of the stacked figure among the winning symbols: each stack's top cell, with its height as symbolId. */
  GetGroupStackedSymbols(combinations: ReelCombinations): SymbolViewInfos {
    const stackConfig = this.m_config.stackFigureConfig;
    const stackedFigures: SymbolViewInfos = [];
    const winning = new Set<string>();
    for (const combination of combinations) {
      for (const info of combination.symbolViewInfos) if (info.symbolId === stackConfig.stackedFigureId) winning.add(info.coord.key());
    }
    for (let col = 0; col < stackConfig.visibleCols; ++col) {
      let found = 0;
      for (let row = 0; row < stackConfig.visibleRows; ++row) {
        if (!winning.has(new SymbolGridCoordinates(col, row).key())) {
          found = 0;
          continue;
        }
        ++found;
        if (found === 1) stackedFigures.push(new SymbolViewInfo(found, new SymbolGridCoordinates(col, row)));
        else stackedFigures[stackedFigures.length - 1].symbolId = found;
      }
    }
    return stackedFigures;
  }
}
