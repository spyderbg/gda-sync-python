// Egt::Game::AlphaFamily::ExpandRules (AlphaFamily/Math/Reel/Rules/ExpandRules.h/.cpp): expanding symbols.

import { CombinationType, type SymbolId } from '../../Common/Common.data';
import { RoundConfigError } from '../../Common/Exceptions';
import type { ReelRoundRules } from '../ReelRoundRules';
import { SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { ExpandPolicy, type ExpandRulesConfig, type ExpandSymbol } from './ExpandRules.data';

export class ExpandRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: ExpandRulesConfig) {
    super(roundRules);
  }

  IsExpandSymbol(symbolId: SymbolId) {
    return this.GetExpandSymbol(symbolId) !== null;
  }

  GetExpandSymbol(symbolId: SymbolId): ExpandSymbol | null {
    return this.m_config.expandSymbols.find(expand => expand.symbolId === symbolId) ?? null;
  }

  CanOverrideTarget(expand: ExpandSymbol | SymbolId, target: SymbolId): boolean {
    const symbol = typeof expand === 'number' ? this.GetExpandSymbol(expand) : expand;
    if (!symbol) return false;
    if (symbol.include.size) return symbol.include.has(target);
    if (symbol.exclude.size) return !symbol.exclude.has(target);
    return true;
  }

  ExpandSymbols(_context: Context, spinPhase: SpinReelsPhase) {
    const stop = spinPhase.stop;
    for (const expand of this.m_config.expandSymbols) {
      const expandId = expand.symbolId;
      for (const reel of stop) {
        if (!reel.includes(expandId)) continue;
        for (let row = 0; row < reel.length; row++) {
          if (!this.CanOverrideTarget(expandId, reel[row])) {
            throw new RoundConfigError('ExpandRules::ExpandSymbols override forbidden!', { 'expand.symbolId': expandId, 'target.symbolId': reel[row], reel, stop });
          }
          reel[row] = expandId;
        }
      }
    }
  }

  FilterExpandSymbols(_context: Context, spinPhase: SpinReelsPhase) {
    const initialStop = spinPhase.initialStop;
    const stop = spinPhase.stop;
    // ExpandPolicy::WinForming
    for (const expand of this.m_config.expandSymbols) {
      if (expand.policy === ExpandPolicy.Always) continue;
      const expandId = expand.symbolId;
      let maxLeftToRightLineWinLen = 0;
      for (const combo of spinPhase.combinations) {
        if (combo.type !== CombinationType.LeftToRight || !combo.wildIds.has(expandId)) continue;
        maxLeftToRightLineWinLen = Math.max(maxLeftToRightLineWinLen, combo.symbolCount);
      }
      for (let reelIndex = maxLeftToRightLineWinLen; reelIndex < stop.length; reelIndex++) {
        // revert expanded(non-winning) to initial symbols
        for (let rowIndex = 0; rowIndex < stop[reelIndex].length; rowIndex++) {
          if (stop[reelIndex][rowIndex] === expandId) stop[reelIndex][rowIndex] = initialStop[reelIndex][rowIndex];
        }
      }
    }
  }
}
