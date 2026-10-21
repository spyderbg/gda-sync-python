// Egt::Game::AlphaFamily::States::IGambleRound (AlphaFamily/States/Match/IGambleRound.h): the round's token, for the match's
// transit to it. BurningCrownTetraSpins10 has no such round: its states are not in its machine.

import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export const IGambleRound = Interface<object>('IGambleRound');
