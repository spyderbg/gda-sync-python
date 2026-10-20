// Egt::Game::AlphaFamily::TetraSpinRulesConfig (AlphaFamily/Math/Reel/Rules/TetraSpinRules.data.h).

import { CollectorRulesConfig } from './CollectorRules.data';
import { CopySymbolsRulesConfig } from './CopySymbolsRules.data';
import { ExpandRulesConfig } from './ExpandRules.data';
import { LineRulesConfig } from './LineRules.data';
import { ScatterRulesConfig } from './ScatterRules.data';
import { SpinRulesConfig } from './SpinRules.data';
import { StickSymbolsRulesConfig } from './StickSymbolsRules.data';

export interface SubScreenConfig {
  expandConfig: ExpandRulesConfig;
  lineConfig: LineRulesConfig;
  scatterConfig: ScatterRulesConfig;
  spinConfig: SpinRulesConfig;
  copySymbolsConfig: CopySymbolsRulesConfig;
  stickSymbolsConfig: StickSymbolsRulesConfig;
  collectorConfig: CollectorRulesConfig;
}

export function SubScreenConfig(): SubScreenConfig {
  return {
    expandConfig: ExpandRulesConfig(), lineConfig: LineRulesConfig(), scatterConfig: ScatterRulesConfig(),
    spinConfig: SpinRulesConfig(), copySymbolsConfig: CopySymbolsRulesConfig(), stickSymbolsConfig: StickSymbolsRulesConfig(),
    collectorConfig: CollectorRulesConfig(),
  };
}

export interface TetraSpinRulesConfig {
  /** each subscreen config */
  subScreens: SubScreenConfig[];
  /** min times bet to trigger the tetra spin round */
  tetraTriggerTimesBet: number;
  /** max number of tetra rounds, auto exit after that */
  tetraMaxRounds: number;
}

export function TetraSpinRulesConfig(): TetraSpinRulesConfig {
  return { subScreens: [], tetraTriggerTimesBet: 0, tetraMaxRounds: 0 };
}
