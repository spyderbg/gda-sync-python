// Egt::Game::AlphaFamily::HoldAndSpinRoundStorage (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRound.data.h).

import type { HoldAndSpinRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundInput.data';
import type { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';

export class HoldAndSpinRoundStorage {
  roundInput: HoldAndSpinRoundInput | null = null;
  roundResult: RoundResult | null = null;
  phaseIdx = 0;
}
