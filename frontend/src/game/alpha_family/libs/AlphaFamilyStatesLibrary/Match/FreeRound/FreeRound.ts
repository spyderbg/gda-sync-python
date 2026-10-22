// Egt::Game::AlphaFamily::FreeRoundState (AlphaFamilyStatesLibrary/Match/FreeRound/FreeRound): the free spins' reel
// round, which consumes FreeSpinEnergy.

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IFreeRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { ReelRoundState } from '../ReelRound/ReelRound';

export class FreeRoundState extends ReelRoundState {
  static Interfaces = [IFreeRound, ...ReelRoundState.Interfaces];

  GetRoundType() {
    return RoundType.Free;
  }

  protected InitRoundInput(input: ReelRoundInput) {
    const betManager = this.ConstParent(IBetManager);

    // TODO: copy bet from IMatch previous round

    input.roundType = RoundType.Free;
    input.bet = betManager.GetInitialBet();
    input.betType = Currency.FreeSpinEnergy;
    input.lines = betManager.GetInitialLines();
    input.betPerLine = input.bet / input.lines;
    input.consume = new Currencies(Currency.FreeSpinEnergy, input.bet);
  }
}

EgtALogCategoryClass(FreeRoundState, 'FreeRoundState');
