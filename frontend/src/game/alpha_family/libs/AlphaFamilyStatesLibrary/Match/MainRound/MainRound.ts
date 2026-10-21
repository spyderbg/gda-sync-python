// Egt::Game::AlphaFamily::MainRoundState (AlphaFamilyStatesLibrary/Match/MainRound/MainRound): the main game's reel
// round, which consumes the MainSpinEnergy the match starts with.

import { Currencies } from '@game/engine/Game/Math/Common.data';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IMainRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMainRound';
import { IReelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { ReelRoundState } from '../ReelRound/ReelRound';

export class MainRoundState extends ReelRoundState {
  static Interfaces = [IReelRound, IMainRound];

  GetRoundType() {
    return RoundType.Main;
  }

  protected InitRoundInput(input: ReelRoundInput) {
    const betManager = this.ConstParent(IBetManager);
    input.roundType = RoundType.Main;
    input.bet = betManager.GetInitialBet();
    input.betType = Currency.Credits;
    input.lines = betManager.GetInitialLines();
    input.betPerLine = input.bet / input.lines;
    input.consume = new Currencies(Currency.MainSpinEnergy, input.bet);
  }
}
