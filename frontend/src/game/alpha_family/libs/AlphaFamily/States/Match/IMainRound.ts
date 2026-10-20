// Egt::Game::AlphaFamily::States::IMainRound and its substates (AlphaFamily/States/Match/IMainRound.h).

import { Interface } from '../../../../../engine/GameCore/RuntimeAccess';
import type { IReelRound } from './IReelRound';

export const IMainRound = Interface<IReelRound>('IMainRound');
export const IMainRoundStarting = Interface<object>('IMainRoundStarting');
export const IMainRoundReeling = Interface<object>('IMainRoundReeling');
export const IMainRoundPresenting = Interface<object>('IMainRoundPresenting');
export const IMainRoundEnding = Interface<object>('IMainRoundEnding');
