// Egt::Game::AlphaFamily::States::IReelRound (AlphaFamily/States/Match/IReelRound.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { ReelRoundRules } from '../../Math/Reel/ReelRoundRules';
import type { IRound } from './IRound';

export interface IReelRound extends IRound {
  GetRoundRules(): ReelRoundRules;
}

export const IReelRound = Interface<IReelRound>('IReelRound');
