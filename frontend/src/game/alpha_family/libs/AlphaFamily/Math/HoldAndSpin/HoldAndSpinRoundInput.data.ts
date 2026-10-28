// Egt::Game::AlphaFamily::HoldAndSpinRoundInput (AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundInput.data.h).

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { RoundType, type SymbolGrid } from '../Common/Common.data';

export class HoldAndSpinRoundInput {
  roundType = RoundType.Undefined;
  bet = 0;
  consume = new Currencies();
  visualSeed = 0;

  // last spin phase result
  triggerRoundType = RoundType.Undefined;
  triggerStop: SymbolGrid = [];
  replaceDistributionIndex = 0;

  // last HoldAndSpin phase
  prevStop: SymbolGrid = [];
  prevHoldAndSpinEnergy = 0;

  Clone() {
    const result = Object.assign(new HoldAndSpinRoundInput(), this);
    result.consume = this.consume.Clone();
    result.triggerStop = this.triggerStop.map(reel => [...reel]);
    result.prevStop = this.prevStop.map(reel => [...reel]);
    return result;
  }
}
