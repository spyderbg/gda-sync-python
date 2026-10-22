// Egt::Game::AlphaFamily::CoinsRoundState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRound): the coins' reel
// round, which consumes CoinsSpinEnergy and pays credits.

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { ICoinsRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { ReelRoundState } from '../ReelRound/ReelRound';

export class CoinsRoundState extends ReelRoundState {
  static Interfaces = [ICoinsRound, ...ReelRoundState.Interfaces];

  GetRoundType() {
    return RoundType.Coins;
  }

  protected InitRoundInput(input: ReelRoundInput) {
    const betManager = this.ConstParent(IBetManager);

    const gameflow = this.RuntimeGetConst(IGameflow);
    // TODO: copy bet from IMatch previous round

    input.roundType = RoundType.Coins;
    input.bet = betManager.GetInitialBet();
    input.betType = Currency.CoinsSpinEnergy;
    input.lines = betManager.GetInitialLines();
    input.betPerLine = input.bet / input.lines;
    input.consume = new Currencies(Currency.CoinsSpinEnergy, input.bet);
    input.initialMatchCreditBet = gameflow.GetInitialCreditsBet();
  }
}

EgtALogCategoryClass(CoinsRoundState, 'CoinsRoundState');
