// Egt::Game::AlphaFamily gameflow requests and replies (AlphaFamily/RuntimeImport/IGameflow.data.h).

import type { RoundInput, RoundResult } from '../Math/RoundResult.data';

export interface StartMatchRequest {
  bet: number;
}

export interface StartMatchReply {
  approved: boolean;
  bet: number;
}

export interface StartRoundRequest {
  roundInput: RoundInput;
}

export interface StartRoundReply {
  roundResult: RoundResult;
}

export type EndRoundRequest = Record<string, never>;
export type EndRoundReply = Record<string, never>;
export type EndMatchRequest = Record<string, never>;

export interface EndMatchReply {
  totalMatchWin: number;
}
