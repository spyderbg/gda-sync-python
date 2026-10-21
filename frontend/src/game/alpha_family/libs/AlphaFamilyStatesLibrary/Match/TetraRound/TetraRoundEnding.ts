// Egt::Game::AlphaFamily::TetraRoundEndingState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundEnding): ends the
// round with the gameflow; another tetra round follows while the match's credits allow it.

import { State } from '@game/engine/Fsm/Fsm';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ITetraRound, ITetraRoundEnding, ITetraRoundInput, ITetraRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { TetraRoundStorage } from './TetraRound.data';

export class TetraRoundEndingState extends State {
  static Interfaces = [ITetraRoundEnding];

  OnTransit(_isStartup: boolean, isRecovery: boolean) {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
    this.Parent(ITetraRound).SetupViews({});
    if (!isRecovery) this.RuntimeGet(IGameflow).RequestEndRound({});
  }

  private StoreLastRoundResult() {
    // The last reel round result must be stored, to be displayed in the next idle state
    const storage = this.Nvram(TetraRoundStorage);
    if (!storage.roundResult) return;
    this.Parent(IGameManager).SetLastRoundResult(storage.roundResult);
    storage.roundResult = null;
  }

  OnEndRoundReply() {
    this.StoreLastRoundResult();
    return this.ToRoundOutro();
  }

  ToRoundOutro() {
    this.UpdateBet();
    return this.Transit(this.RuntimeGetConst(IGameflow).GetNextRoundType() === RoundType.Tetra ? ITetraRoundInput : ITetraRoundOutro);
  }

  private UpdateBet() {
    const gameflow = this.RuntimeGetConst(IGameflow);
    if (gameflow.GetNextRoundType() !== RoundType.Tetra) return;
    const betManager = this.Parent(IBetManager);
    const available = gameflow.GetMatchCurrencyAvailable(Currency.Credits);
    if (available >= betManager.GetCurrentBet()) return;
    const allowedBets = this.Parent(ITetraRound).GetRoundRules().GetAllowedBets(0, available);
    if (allowedBets.length) betManager.SetCurrentBet(allowedBets[allowedBets.length - 1]);
  }
}
