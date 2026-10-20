// Egt::Game::AlphaFamily::ReelRoundRulesConfig (AlphaFamily/Math/Reel/ReelRoundRules.data.h).

import type { CurrencyType } from '../../../../../engine/Game/Math/Common.data';
import { Currency, ELastResultSlot, Multipliers, type Reels, RoundType } from '../Common/Common.data';
import { CollectorRulesConfig } from './Rules/CollectorRules.data';
import { CopySymbolsRulesConfig } from './Rules/CopySymbolsRules.data';
import { ExpandRulesConfig } from './Rules/ExpandRules.data';
import { HoldAndSpinTriggerRulesConfig } from './Rules/HoldAndSpinTriggerRules.data';
import { LineRulesConfig } from './Rules/LineRules.data';
import { RtpRulesConfig } from './Rules/RtpRules.data';
import { ScatterRulesConfig } from './Rules/ScatterRules.data';
import { SpinRulesConfig } from './Rules/SpinRules.data';
import { StickSymbolsRulesConfig } from './Rules/StickSymbolsRules.data';
import { TetraSpinRulesConfig } from './Rules/TetraSpinRules.data';

export interface ReelRoundRulesConfig {
  roundType: RoundType;
  version: string;
  fakeReels: Reels;
  rowsCount: number;
  allowedBetAmounts: number[];
  allowedBetLines: number[];
  multipliers: Multipliers;
  lastResultSlot: ELastResultSlot;
  betBarCurrencyType: CurrencyType;
  estimateValues: Map<CurrencyType, number>;

  expandConfig: ExpandRulesConfig;
  lineConfig: LineRulesConfig;
  rtpConfig: RtpRulesConfig;
  scatterConfig: ScatterRulesConfig;
  spinConfig: SpinRulesConfig;
  copySymbolsConfig: CopySymbolsRulesConfig;
  stickSymbolsConfig: StickSymbolsRulesConfig;
  collectorConfig: CollectorRulesConfig;

  tetraSpinConfig: TetraSpinRulesConfig;
  holdAndSpinTriggerConfig: HoldAndSpinTriggerRulesConfig;

  maxBetMultiplier: number;
  minBetMultiplier: number;
}

export function ReelRoundRulesConfig(): ReelRoundRulesConfig {
  return {
    roundType: RoundType.Undefined, version: '', fakeReels: [], rowsCount: 0, allowedBetAmounts: [], allowedBetLines: [],
    multipliers: new Multipliers(), lastResultSlot: ELastResultSlot.Main, betBarCurrencyType: Currency.Undefined,
    estimateValues: new Map(), expandConfig: ExpandRulesConfig(), lineConfig: LineRulesConfig(), rtpConfig: RtpRulesConfig(),
    scatterConfig: ScatterRulesConfig(), spinConfig: SpinRulesConfig(), copySymbolsConfig: CopySymbolsRulesConfig(),
    stickSymbolsConfig: StickSymbolsRulesConfig(), collectorConfig: CollectorRulesConfig(), tetraSpinConfig: TetraSpinRulesConfig(),
    holdAndSpinTriggerConfig: HoldAndSpinTriggerRulesConfig(), maxBetMultiplier: 0, minBetMultiplier: 0,
  };
}
