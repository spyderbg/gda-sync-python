// Egt::Game::AlphaFamily::ReelRoundState (AlphaFamilyStatesLibrary/Match/ReelRound/ReelRound.h/.cpp): a reel round,
// whose input it prepares on entering; MainRoundState is the main game's.

import { State } from '@game/engine/Fsm/Fsm';
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

  OnTransit() {
    if (!this.ConstNvram(ReelRoundStorage).roundInput) {
      const input = new ReelRoundInput();
      this.InitRoundInput(input);
      this.PrepareInput(input);
      this.Nvram(ReelRoundStorage).roundInput = input;
    }
    this.Parent(IGameManager).SetHasEnteredRound(this.GetRoundType(), true);
  }

  abstract GetRoundType(): RoundType;
  protected abstract InitRoundInput(input: ReelRoundInput): void;

  GetRoundRules() {
    return this.RuntimeGetConst(IMathRules).GetReelRoundRules(this.GetRoundType());
  }

  protected PrepareInput(input: ReelRoundInput) {
    this.GetRoundRules().PrepareInput(input, this.Parent(IGameManager).GetLastRoundResult());
  }
}
