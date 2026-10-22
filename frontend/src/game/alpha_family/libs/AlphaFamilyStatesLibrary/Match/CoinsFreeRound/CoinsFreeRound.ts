// Egt::Game::AlphaFamily::CoinsFreeRoundState (AlphaFamilyStatesLibrary/Match/CoinsFreeRound/CoinsFreeRound): the coins'
// free spins' reel round, which consumes CoinsFreeSpinEnergy.

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { ICoinsFreeRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsFreeRound';
import { ReelRoundState } from '../ReelRound/ReelRound';

export class CoinsFreeRoundState extends ReelRoundState {
  static Interfaces = [ICoinsFreeRound, ...ReelRoundState.Interfaces];

  GetRoundType() {
    return RoundType.CoinsFree;
  }

  protected InitRoundInput(input: ReelRoundInput) {
    const betManager = this.ConstParent(IBetManager);

    // TODO: copy bet from IMatch previous round

    input.roundType = RoundType.CoinsFree;
    input.bet = betManager.GetInitialBet();
    input.betType = Currency.CoinsFreeSpinEnergy;
    input.lines = betManager.GetInitialLines();
    input.betPerLine = input.bet / input.lines;
    input.consume = new Currencies(Currency.CoinsFreeSpinEnergy, input.bet);
  }
}

EgtALogCategoryClass(CoinsFreeRoundState, 'CoinsFreeRoundState');
