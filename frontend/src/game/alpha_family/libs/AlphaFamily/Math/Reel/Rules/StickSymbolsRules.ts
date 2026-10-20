// Egt::Game::AlphaFamily::StickSymbolsRules (AlphaFamily/Math/Reel/Rules/StickSymbolsRules.h/.cpp): stick a symbol to
// rows of each reel, by a pattern rolled per reel.

import type { SymbolIds } from '../../Common/Common.data';
import { SelectRandomValue } from '../../Common/Weighted';
import type { ReelRoundRules } from '../ReelRoundRules';
import { SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { StickSymbolsRulesConfig } from './StickSymbolsRules.data';

// The rows a pattern sticks the symbol to (implemented only for 3 rows).
const PATTERNS: number[][] = [[], [0], [1], [2], [0, 1], [1, 2], [0, 2], [0, 1, 2]];

export class StickSymbolsRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: StickSymbolsRulesConfig) {
    super(roundRules);
  }

  GetConfig() {
    return this.m_config;
  }

  Update(context: Context, spinPhase: SpinReelsPhase) {
    if (this.m_config.symbolId === -1) return;
    const stop = spinPhase.stop;
    for (let i = 0; i < stop.length; i++) {
      const distribution = this.m_config.distrPerReel[i];
      if (!distribution) break;
      this.StickSymbol(stop[i], SelectRandomValue(distribution, context.mathRng));
    }
  }

  StickSymbol(reel: SymbolIds, patchIdx: number) {
    if (reel.length !== 3) return;
    for (const row of PATTERNS[patchIdx] ?? []) reel[row] = this.m_config.symbolId;
  }
}
