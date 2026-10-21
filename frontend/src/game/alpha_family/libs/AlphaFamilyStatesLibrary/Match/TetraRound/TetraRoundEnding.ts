// Egt::Game::AlphaFamily::TetraRoundEndingState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRoundEnding): ends the
// round with the gameflow; another tetra round follows while the match's credits allow it.

import { State } from '@game/engine/Fsm/Fsm';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { EndRoundRequest, type EndRoundReply } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.data';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ITetraRound, ITetraRoundEnding, ITetraRoundInput, ITetraRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { TetraRoundStorage } from './TetraRound.data';

export class TetraRoundEndingState extends State {
  static Interfaces = [ITetraRoundEnding];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(ITetraRound).GetRoundType(), isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');
    void isStartup;
    void isRecovery;

    this.AttachCallbacks();

    this.Parent(ITetraRound).SetupViews({});

    if (!isRecovery) {
      this.RequestEndRound();
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IGameflow.Events).endRoundReply, this.OnEndRoundReply);
  }

  private RequestEndRound() {
    const request = new EndRoundRequest();
    this.RuntimeGet(IGameflow).RequestEndRound(request);
  }

  private StoreLastRoundResult() {
    // The last reel round result must be stored, to be displayed in the next idle state
    // TODO: find a better way to implement this
    const storage = this.Nvram(TetraRoundStorage);
    if (AssertIf(!storage.roundResult)) return;

    this.Parent(IGameManager).SetLastRoundResult(storage.roundResult!);
    storage.roundResult = null;
  }

  private OnEndRoundReply(_reply: EndRoundReply) {
    this.StoreLastRoundResult();

    return this.ToRoundOutro();
  }

  ToRoundOutro() {
    this.UpdateBet();

    if (this.RuntimeGetConst(IGameflow).GetNextRoundType() === RoundType.Tetra) {
      return this.Transit(ITetraRoundInput);
    } else {
      return this.Transit(ITetraRoundOutro);
    }
  }

  private UpdateBet() {
    // temp code
    const gameflow = this.RuntimeGetConst(IGameflow);
    if (gameflow.GetNextRoundType() !== RoundType.Tetra) return;

    const betManager = this.Parent(IBetManager);
    const available = gameflow.GetMatchCurrencyAvailable(Currency.Credits);
    if (available >= betManager.GetCurrentBet()) return;

    const rules = this.Parent(ITetraRound).GetRoundRules();
    const allowedBets = rules.GetAllowedBets(0, available);
    if (AssertIf(allowedBets.length === 0)) return;

    betManager.SetCurrentBet(allowedBets[allowedBets.length - 1]);
  }
}

EgtALogCategoryClass(TetraRoundEndingState, 'TetraRoundEndingState');
