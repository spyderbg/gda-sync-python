// Egt::Game::AlphaFamily::States::IReelRound (AlphaFamily/States/Match/IReelRound.h).

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { ReelRoundRules } from '../../Math/Reel/ReelRoundRules';
import type { IRound } from './IRound';

export interface IReelRound extends IRound {
  GetRoundRules(): ReelRoundRules;
}

export const IReelRound = Interface<IReelRound>('IReelRound');
export const IReelRoundIntro = Interface<object>('IReelRoundIntro');
export const IReelRoundInput = Interface<object>('IReelRoundInput');
export const IReelRoundStarting = Interface<object>('IReelRoundStarting');
export const IReelRoundReeling = Interface<object>('IReelRoundReeling');
export const IReelRoundPresenting = Interface<object>('IReelRoundPresenting');
export const IReelRoundEnding = Interface<object>('IReelRoundEnding');
export const IReelRoundOutro = Interface<object>('IReelRoundOutro');
