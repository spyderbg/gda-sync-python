// Egt::Game::AlphaFamily::States::IFreeRound and its substates (AlphaFamily/States/Match/IFreeRound.h). Its
// state is a reel round: the token is typed as IReelRound's, as the state's Interfaces list it with ReelRoundState's.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { IReelRound } from './IReelRound';

export const IFreeRound = Interface<IReelRound>('IFreeRound');
export const IFreeRoundIntro = Interface<object>('IFreeRoundIntro');
export const IFreeRoundInput = Interface<object>('IFreeRoundInput');
export const IFreeRoundStarting = Interface<object>('IFreeRoundStarting');
export const IFreeRoundReeling = Interface<object>('IFreeRoundReeling');
export const IFreeRoundPresenting = Interface<object>('IFreeRoundPresenting');
export const IFreeRoundEnding = Interface<object>('IFreeRoundEnding');
export const IFreeRoundOutro = Interface<object>('IFreeRoundOutro');
