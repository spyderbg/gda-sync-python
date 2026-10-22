// Egt::Game::AlphaFamily::States::ICoinsRound and its substates (AlphaFamily/States/Match/ICoinsRound.h). Its
// state is a reel round: the token is typed as IReelRound's, as the state's Interfaces list it with ReelRoundState's.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { IReelRound } from './IReelRound';

export const ICoinsRound = Interface<IReelRound>('ICoinsRound');
export const ICoinsRoundIntro = Interface<object>('ICoinsRoundIntro');
export const ICoinsRoundInput = Interface<object>('ICoinsRoundInput');
export const ICoinsRoundStarting = Interface<object>('ICoinsRoundStarting');
export const ICoinsRoundReeling = Interface<object>('ICoinsRoundReeling');
export const ICoinsRoundPresenting = Interface<object>('ICoinsRoundPresenting');
export const ICoinsRoundEnding = Interface<object>('ICoinsRoundEnding');
export const ICoinsRoundOutro = Interface<object>('ICoinsRoundOutro');
