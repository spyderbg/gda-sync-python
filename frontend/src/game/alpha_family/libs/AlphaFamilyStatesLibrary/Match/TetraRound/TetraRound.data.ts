// Egt::Game::AlphaFamily::TetraRoundStorage and TetraRoundStatics (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRound.data.h,
// TetraRoundPresenting.data.h).

import type { ReelRoundInput } from '../../../AlphaFamily/Math/Reel/ReelRoundInput.data';
import type { RoundResult } from '../../../AlphaFamily/Math/RoundResult.data';

export class TetraRoundStorage {
  roundInput: ReelRoundInput | null = null;
  roundResult: RoundResult | null = null;
}

export class TetraRoundStatics {
  requestedFastStop = false;
}

export enum TetraPresentingStep {
  StopReels,
  FlyCrowns,
  ShowLines,
  DimAndAnnounce,
  SpecialCombo,
}

export class TetraRoundPresentingStatics {
  subScreenIdx = 0;
  step = TetraPresentingStep.StopReels;
  pendingRoundEnd = false;
}
