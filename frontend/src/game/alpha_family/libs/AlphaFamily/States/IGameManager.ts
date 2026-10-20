// Egt::Game::AlphaFamily::States::IGameManager (AlphaFamily/States/IGameManager.h, IGameManager.data.h).

import { Interface } from '../../../../engine/GameCore/RuntimeAccess';
import type { RoundType } from '../Math/Common/Common.data';
import type { RoundResult } from '../Math/RoundResult.data';

export interface IGameManager {
  SetAutoPlay(autoPlayOn: boolean): void;
  IsAutoPlayOn(): boolean;
  GetLastMatchWin(): number;
  GetHasEnteredRound(roundType: RoundType): boolean;
  SetHasEnteredRound(roundType: RoundType, hasEntered: boolean): void;
  FindRandomZeroRewardRound(roundType: RoundType): RoundResult | null;
  SetLastRoundResult(result: RoundResult): void;
  GetLastRoundResult(): RoundResult;
}

export class GameManagerNvrams {
  lastRoundResults: RoundResult[] = [];
  gambleHistoryResults: RoundResult[] = [];
  lastRoundSlot = 0;
  hasEnteredRound = new Set<RoundType>();
  taxedWin = false;
}

export class GameManagerStatics {
  lastMatchWin = 0; // net win
  isAutoplay = false;
}

export const IGameManager = Interface<IGameManager>('IGameManager');
