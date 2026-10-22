// Egt::Game::AlphaFamily::WheelRoundStorage (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRound.data.h).

import type { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import type { WheelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundInput.data';

export class WheelRoundStorage {
  roundInput: WheelRoundInput | null = null;
  roundResult: RoundResult | null = null;
  wheelStopSector: number | null = null;
}
