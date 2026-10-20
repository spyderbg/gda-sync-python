// Egt::Game::AlphaFamily::ReelRoundInput (AlphaFamily/Math/Reel/ReelRoundInput.data.h).

import { Currencies, type CurrencyType } from '../../../../../engine/Game/Math/Common.data';
import { Currency, RoundType } from '../Common/Common.data';

export class ReelRoundInput {
  roundType = RoundType.Undefined;
  bet = 0;
  betType: CurrencyType = Currency.Undefined;
  lines = 0;
  betPerLine = 0;
  consume = new Currencies();
  visualSeed = 0;
  initialMatchCreditBet = 0;

  Clone() {
    const result = Object.assign(new ReelRoundInput(), this);
    result.consume = this.consume.Clone();
    return result;
  }
}
