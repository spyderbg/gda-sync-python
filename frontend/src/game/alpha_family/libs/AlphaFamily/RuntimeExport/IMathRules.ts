// Egt::Game::AlphaFamily::IMathRules (AlphaFamily/RuntimeExport/IMathRules.h): the rules of the game's rounds.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { RoundType } from '../Math/Common/Common.data';
import type { ReelRoundRules } from '../Math/Reel/ReelRoundRules';

export interface IMathRules {
  GetAvailableRoundTypes(): RoundType[];
  GetConsecutiveRoundTypePriorities(): Map<RoundType, number>;
  HasReelRoundRules(roundType: RoundType): boolean;
  GetReelRoundRules(roundType: RoundType): ReelRoundRules;
  HasHoldAndSpinRules(roundType: RoundType): boolean;
  HasWheelRoundRules(roundType: RoundType): boolean;
}

export const IMathRules = Interface<IMathRules>('IMathRules');
