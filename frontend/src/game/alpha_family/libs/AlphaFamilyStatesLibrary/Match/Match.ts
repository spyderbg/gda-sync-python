// Egt::Game::AlphaFamily::MatchState (AlphaFamilyStatesLibrary/Match/Match.h/.cpp): a match, from its start to taking
// its win; its next round is the gameflow's.

import { State } from '../../../../engine/Fsm/Fsm';
import { RoundType } from '../../AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '../../AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '../../AlphaFamily/States/IGameManager';
import { IMatch, MatchNvrams } from '../../AlphaFamily/States/Match/IMatch';
import { IMatchCappingApplied } from '../../AlphaFamily/States/Match/IMatchCappingApplied';
import { IMatchTakeWin } from '../../AlphaFamily/States/Match/IMatchTakeWin';
import { ITetraRound } from '../../AlphaFamily/States/Match/ITetraRound';

export class MatchState extends State implements IMatch {
  static Interfaces = [IMatch];
  static Nvrams = [MatchNvrams];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    if (isRecovery) return;
    for (const roundType of this.RuntimeGet(IMathRules).GetAvailableRoundTypes()) this.Parent(IGameManager).SetHasEnteredRound(roundType, false);
  }

  ToNextRound() {
    switch (this.RuntimeGetConst(IGameflow).GetNextRoundType()) {
      case RoundType.Tetra: return this.Transit(ITetraRound);
      // BurningCrownTetraSpins10 has no Free, Extra, ExtraFree, HoldAndSpin, Wheel, Gamble, Coins or CoinsFree rounds:
      // their states are not in its machine.
      default: return this.ToTakeWin();
    }
  }

  ToTakeWin() {
    return this.Transit(this.RuntimeGetConst(IGameflow).IsCappingHit() ? IMatchCappingApplied : IMatchTakeWin);
  }
}
