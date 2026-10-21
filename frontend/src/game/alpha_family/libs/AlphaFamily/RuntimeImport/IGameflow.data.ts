// Egt::Game::AlphaFamily gameflow requests and replies (AlphaFamily/RuntimeImport/IGameflow.data.h).

import { ReelRoundInput } from '../Math/Reel/ReelRoundInput.data';
import type { RoundInput, RoundResult } from '../Math/RoundResult.data';

////////////////////////////////////////
/// Start Match
////////////////////////////////////////

export class StartMatchRequest {
  bet = 0;
}

export class StartMatchReply {
  approved = false;
  bet = 0;
}

////////////////////////////////////////
/// Start Round
////////////////////////////////////////

export class StartRoundRequest {
  roundInput: RoundInput = new ReelRoundInput();
  showFastLines = false;
}

export class StartRoundReply {
  roundResult!: RoundResult;
  showFastLines = false;
}

////////////////////////////////////////
/// End Round
////////////////////////////////////////

export class EndRoundRequest {}

export class EndRoundReply {}

////////////////////////////////////////
/// End Match
////////////////////////////////////////

export class EndMatchRequest {}

export class EndMatchReply {
  totalMatchWin = 0;
}
