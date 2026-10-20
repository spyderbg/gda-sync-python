// Egt::Game::AlphaFamily::CopySymbolsRules (AlphaFamily/Math/Reel/Rules/CopySymbolsRules.h/.cpp): copy symbols from
// the previous sub screen's stop (the tetra round's crowns falling into the next screens).

import type { ReelRoundRules } from '../ReelRoundRules';
import { SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { CopySymbolsRulesConfig } from './CopySymbolsRules.data';

export class CopySymbolsRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: CopySymbolsRulesConfig) {
    super(roundRules);
  }

  GetConfig() {
    return this.m_config;
  }

  Update(context: Context, spinPhase: SpinReelsPhase) {
    if (!this.m_config.symbolIds.length || !context.gridTocopyFrom) return;
    for (const symbolId of this.m_config.symbolIds) {
      for (const info of BaseReelRules.GetAllCoordinates(context.gridTocopyFrom, symbolId)) {
        spinPhase.stop[info.coord.reelId][info.coord.rowId] = symbolId;
      }
    }
  }
}
