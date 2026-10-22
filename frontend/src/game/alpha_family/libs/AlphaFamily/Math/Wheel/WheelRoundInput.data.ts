// Egt::Game::AlphaFamily::WheelRoundInput (AlphaFamily/Math/Wheel/WheelRoundInput.data.h).

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { RoundType } from '../Common/Common.data';
import type { WheelSectorGroupId } from './WheelRoundRules.data';

export class WheelRoundInput {
  roundType = RoundType.Undefined;

  bet = 0;
  betGroup: WheelSectorGroupId = -1;
  consume = new Currencies();
  visualSeed = 0;

  Clone() {
    const result = Object.assign(new WheelRoundInput(), this);
    result.consume = this.consume.Clone();
    return result;
  }
}
