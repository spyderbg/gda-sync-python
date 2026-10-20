// Egt::Game::AlphaFamily::States::IMatch (AlphaFamily/States/Match/IMatch.h).

import type { Reaction } from '../../../../../engine/Fsm/Fsm';
import { Interface } from '../../../../../engine/GameCore/RuntimeAccess';

export interface IMatch {
  ToNextRound(): Reaction;
  ToTakeWin(): Reaction;
}

export class MatchNvrams {}
export class MatchStatics {}

export const IMatch = Interface<IMatch>('IMatch');
