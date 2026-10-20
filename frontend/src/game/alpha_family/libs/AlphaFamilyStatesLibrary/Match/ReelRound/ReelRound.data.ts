// Egt::Game::AlphaFamily::ReelRoundStorage and ReelRoundStatics (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRound.data.h).

import type { ReelRoundInput } from '../../../AlphaFamily/Math/Reel/ReelRoundInput.data';
import type { RoundResult } from '../../../AlphaFamily/Math/RoundResult.data';

export class ReelRoundStorage {
  roundInput: ReelRoundInput | null = null;
  roundResult: RoundResult | null = null;
}

export class ReelRoundStatics {
  requestedFastStop = false;
}

export class ReelRoundPresentingStatics {
  phaseIdx = 0;
  HasPendingRoundEnd = false;
  HasAccumulatedReward = false;
  HasSymbolsExpanded = false;
  HasShowedFastLines = false; // used for auto play and free spins
}
