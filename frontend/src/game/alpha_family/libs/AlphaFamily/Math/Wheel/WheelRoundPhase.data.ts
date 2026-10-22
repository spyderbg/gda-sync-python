// Egt::Game::AlphaFamily::WheelRoundPhase (AlphaFamily/Math/Wheel/WheelRoundPhase.data.h).

import { PayoutSummary } from '../Common/Common.data';
import type { WheelRewardsPerSector, WheelSectorGroupId, WheelSectorId } from './WheelRoundRules.data';

export class WheelRoundPhase {
  stopSector: WheelSectorId = -1;
  betGroup: WheelSectorGroupId = -1;
  rewardsPerSector: WheelRewardsPerSector = new Map();
  summary = new PayoutSummary();
}

export type WheelRoundPhases = WheelRoundPhase[];
