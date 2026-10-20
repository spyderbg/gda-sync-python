// Egt::Game::AlphaFamily::States::IRound and its substates (AlphaFamily/States/Match/IRound.h).

import type { RoundType } from '../../Math/Common/Common.data';

export interface IRound {
  GetRoundType(): RoundType;
}
