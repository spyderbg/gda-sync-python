// Egt::Game::AlphaFamily::MatchTakeWinState (AlphaFamilyStatesLibrary/Match/MatchTakeWin): the match's win is taken
// (BurningCrownTetraSpins10 has no gamble, so it goes on to taxation or the match's end).

import { State } from '../../../../../engine/Fsm/Fsm';
import { ILimits } from '../../../../../engine/Game/RuntimeImport/ILimits';
import { Currency } from '../../../AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '../../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ICreditTaxation } from '../../../AlphaFamily/States/Match/ICreditTaxation';
import { IMatchEnding } from '../../../AlphaFamily/States/Match/IMatchEnding';
import { IMatchTakeWin } from '../../../AlphaFamily/States/Match/IMatchTakeWin';

export class MatchTakeWinState extends State {
  static Interfaces = [IMatchTakeWin];

  OnTransit() {
    // CanEnterGamble() is false: the game has no gamble round rules.
    this.TransitLater(this.CheckForTax() ? ICreditTaxation : IMatchEnding);
  }

  private CheckForTax() {
    const credits = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable().Get(Currency.Credits);
    return this.RuntimeTryGetConst(ILimits)?.IsTaxThresholdBreached(credits) ?? false;
  }
}
