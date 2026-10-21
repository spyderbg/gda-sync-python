// Egt::Game::AlphaFamily::MatchState (AlphaFamilyStatesLibrary/Match/Match.h/.cpp): a match, from its start to taking
// its win; its next round is the gameflow's.

import { State } from '@game/engine/Fsm/Fsm';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ICoinsFreeRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsFreeRound';
import { ICoinsRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { IExtraFreeRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IExtraFreeRound';
import { IExtraRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IExtraRound';
import { IFreeRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IFreeRound';
import { IGambleRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { IHoldAndSpinRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IMatch, MatchNvrams, MatchStatics } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IMatchCappingApplied } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchCappingApplied';
import { IMatchTakeWin } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchTakeWin';
import { ITetraRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { IWheelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';

export class MatchState extends State implements IMatch {
  static Interfaces = [IMatch];
  static Nvrams = [MatchNvrams];
  static Statics = [MatchStatics];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');
    if (!_isRecovery) {
      for (const roundType of this.RuntimeGet(IMathRules).GetAvailableRoundTypes()) {
        this.Parent(IGameManager).SetHasEnteredRound(roundType, false);
      }
    }
  }

  // BurningCrownTetraSpins10 has none but the tetra round: the others' states are not in its machine.
  ToNextRound() {
    switch (this.RuntimeGetConst(IGameflow).GetNextRoundType()) {
      case RoundType.Free: return this.Transit(IFreeRound);
      case RoundType.Extra: return this.Transit(IExtraRound);
      case RoundType.ExtraFree: return this.Transit(IExtraFreeRound);
      case RoundType.HoldAndSpin: return this.Transit(IHoldAndSpinRound);
      case RoundType.Wheel: return this.Transit(IWheelRound);
      case RoundType.Gamble: return this.Transit(IGambleRound);
      case RoundType.Coins: return this.Transit(ICoinsRound);
      case RoundType.CoinsFree: return this.Transit(ICoinsFreeRound);
      case RoundType.Tetra: return this.Transit(ITetraRound);
      case RoundType.Undefined: // [[fallthrough]]
      default: return this.ToTakeWin();
    }
  }

  ToTakeWin() {
    if (this.RuntimeGetConst(IGameflow).IsCappingHit()) {
      return this.Transit(IMatchCappingApplied);
    } else {
      return this.Transit(IMatchTakeWin);
    }
  }
}

EgtALogCategoryClass(MatchState, 'MatchState');
