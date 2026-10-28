// Egt::Game::AlphaFamily::IMathRules (AlphaFamily/RuntimeExport/IMathRules.h): the rules of the game's rounds.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { RoundType } from '../Math/Common/Common.data';
import type { HoldAndSpinRoundRules } from '../Math/HoldAndSpin/HoldAndSpinRoundRules';
import type { ReelRoundRules } from '../Math/Reel/ReelRoundRules';
import type { WheelRoundRules } from '../Math/Wheel/WheelRoundRules';

export interface IMathRules {
  GetAvailableRoundTypes(): RoundType[];
  GetConsecutiveRoundTypePriorities(): Map<RoundType, number>;

  HasReelRoundRules(roundType: RoundType): boolean;
  GetReelRoundRules(roundType: RoundType): ReelRoundRules;
  HasHoldAndSpinRules(roundType: RoundType): boolean;
  GetHoldAndSpinRoundRules(roundType: RoundType): HoldAndSpinRoundRules;
  HasWheelRoundRules(roundType: RoundType): boolean;
  GetWheelRoundRules(roundType: RoundType): WheelRoundRules;
}

export const IMathRules = Interface<IMathRules>('IMathRules');
