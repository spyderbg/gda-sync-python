// Egt::Game::AlphaFamily::GambleRoundStorage (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRound.data.h).

import type { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import type { WheelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundInput.data';
import type { WheelSectorId } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules.data';

export class GambleRoundStorage {
  roundInput: WheelRoundInput | null = null;
  roundResult: RoundResult | null = null;
  houseCard: WheelSectorId | null = null;
  houseCardsHistory: WheelSectorId[] = [];
}
