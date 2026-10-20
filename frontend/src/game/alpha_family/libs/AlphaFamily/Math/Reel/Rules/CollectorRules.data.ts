// Egt::Game::AlphaFamily::CollectorRulesConfig (AlphaFamily/Math/Reel/Rules/CollectorRules.data.h).

import { ECollectorType, type PayTablesV2, type SymbolId } from '../../Common/Common.data';
import { EmptyWeighted, type Weighted } from '../../Common/Weighted';

export interface CollectorConfig {
  type: ECollectorType;
  bonusValue: Weighted<number>;
}

export interface CollectorRulesConfig {
  /** The collector symbol. */
  symbolId: SymbolId;
  /** Collect applies to the symbols of these paytables, with their rewards. */
  paytable: PayTablesV2;
  distribution: Weighted<CollectorConfig>;
}

export function CollectorRulesConfig(): CollectorRulesConfig {
  return { symbolId: -1, paytable: [], distribution: EmptyWeighted() };
}
