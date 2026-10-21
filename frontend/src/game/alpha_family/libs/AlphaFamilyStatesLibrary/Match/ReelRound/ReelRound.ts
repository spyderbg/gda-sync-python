// Egt::Game::AlphaFamily::ReelRoundState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRound.h/.cpp): a reel round,
// whose input it prepares on entering; MainRoundState is the main game's.

import { State } from '@game/engine/Fsm/Fsm';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import type { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IReelRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IReelRound';
import { ReelRoundStatics, ReelRoundStorage } from './ReelRound.data';

export abstract class ReelRoundState extends State implements IReelRound {
  static Interfaces = [IReelRound];
  static Nvrams = [ReelRoundStorage];
  static Statics = [ReelRoundStatics];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    if (!this.ConstNvram(ReelRoundStorage).roundInput) {
      const input = new ReelRoundInput();
      this.InitRoundInput(input);
      this.PrepareInput(input);

      assert(input.roundType === this.GetRoundType());
      assert(input.bet > 0);
      assert(input.lines > 0);
      assert(input.betPerLine > 0);
      assert(!input.consume.empty());

      this.Nvram(ReelRoundStorage).roundInput = input;
    }

    this.Parent(IGameManager).SetHasEnteredRound(this.GetRoundType(), true);
  }

  abstract GetRoundType(): RoundType;

  GetRoundRules() {
    const roundType = this.GetRoundType();
    const roundRules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    return roundRules;
  }

  protected abstract InitRoundInput(input: ReelRoundInput): void;

  private PrepareInput(input: ReelRoundInput) {
    const lastResult = this.Parent(IGameManager).GetLastRoundResult();
    const rules = this.GetRoundRules();

    rules.PrepareInput(input, lastResult);
  }
}

EgtALogCategoryClass(ReelRoundState, 'ReelRoundState');
