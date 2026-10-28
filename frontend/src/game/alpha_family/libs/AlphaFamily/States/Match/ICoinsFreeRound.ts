// Egt::Game::AlphaFamily::States::ICoinsFreeRound and its substates (AlphaFamily/States/Match/ICoinsFreeRound.h). Its
// state is a reel round: the token is typed as IReelRound's, as the state's Interfaces list it with ReelRoundState's.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';
import type { IReelRound } from './IReelRound';

export const ICoinsFreeRound = Interface<IReelRound>('ICoinsFreeRound');
export const ICoinsFreeRoundIntro = Interface<object>('ICoinsFreeRoundIntro');
export const ICoinsFreeRoundInput = Interface<object>('ICoinsFreeRoundInput');
export const ICoinsFreeRoundStarting = Interface<object>('ICoinsFreeRoundStarting');
export const ICoinsFreeRoundReeling = Interface<object>('ICoinsFreeRoundReeling');
export const ICoinsFreeRoundPresenting = Interface<object>('ICoinsFreeRoundPresenting');
export const ICoinsFreeRoundEnding = Interface<object>('ICoinsFreeRoundEnding');
export const ICoinsFreeRoundOutro = Interface<object>('ICoinsFreeRoundOutro');
