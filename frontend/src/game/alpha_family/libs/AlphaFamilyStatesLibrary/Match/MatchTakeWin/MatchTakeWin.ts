// Egt::Game::AlphaFamily::MatchTakeWinState (AlphaFamilyStatesLibrary/Match/MatchTakeWin): the match's win is taken
// (BurningCrownTetraSpins10 has no gamble, so it goes on to taxation or the match's end).

import { State } from '@game/engine/Fsm/Fsm';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { ICreditTaxation } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICreditTaxation';
import { IMatchEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEnding';
import { IMatchTakeWin } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchTakeWin';

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
