// Egt::Game::AlphaFamily::WheelRoundRulesConfig and its sectors (AlphaFamily/Math/Wheel/WheelRoundRules.data.h).

import type { Currencies, CurrencyType } from '@game/engine/Game/Math/Common.data';
import { RoundType } from '../Common/Common.data';
import { EmptyWeighted, type Weighted } from '../Common/Weighted';

export type WheelSectorId = number;
export type WheelSectorGroupId = number;
export type WheelRewardsPerSector = Map<WheelSectorId, Currencies>;

export namespace WheelSector {
  export interface Payout {
    currencyType: CurrencyType;
    pays: number;
  }
}

export interface WheelSector {
  id: WheelSectorId;
  name: string;
  payouts: WheelSector.Payout[];
}

export interface WheelSectorGroup {
  id: WheelSectorGroupId;
  name: string;
  sectorIds: WheelSectorId[];
}

export interface WheelRoundRulesConfig {
  roundType: RoundType;
  version: string;
  rtp: number;

  sectors: Weighted<WheelSector>;
  bettingGroups: WheelSectorGroup[];
  maxAttempts: number;
  minimumBet: number;
}

export function WheelRoundRulesConfig(): WheelRoundRulesConfig {
  return { roundType: RoundType.Undefined, version: '', rtp: 0, sectors: EmptyWeighted(), bettingGroups: [], maxAttempts: 0, minimumBet: 0 };
}
