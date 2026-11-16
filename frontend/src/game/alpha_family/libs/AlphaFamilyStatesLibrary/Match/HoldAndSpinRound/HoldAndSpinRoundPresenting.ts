// Egt::Game::AlphaFamily::HoldAndSpinRoundPresentingState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundPresenting):
// shows the grid after a phase, with the win bar kept at the match's available win, resets the spins counter when a
// new coin landed, then the next phase's reeling or the round's ending.

import { State } from '@game/engine/Fsm/Fsm';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import { BaseReelRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/BaseReelRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import {
  HoldAndSpinReelSetup, type HoldAndSpinViewOptions, IHoldAndSpinRound, IHoldAndSpinRoundEnding, IHoldAndSpinRoundPresenting,
  IHoldAndSpinRoundReeling,
} from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IHoldAndSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

const emptyInfos: SymbolViewInfos = [];

export class HoldAndSpinRoundPresentingState extends State {
  static Interfaces = [IHoldAndSpinRoundPresenting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.m_waitingBarValueAnim = false;
    this.AtachCallbacks();

    const deferredWinBar = this.GetWinBarStartingValue();
    let viewOptions: HoldAndSpinViewOptions = {
      disableInfoButton: true,
      setupReels: false,
      reelSetup: HoldAndSpinReelSetup.Presenting,
      showMainInfo: true,
      showLastPhaseSpinsCompletedAnimated: !_isRecovery,
    };
    if (this.UsesCoinsWinBar()) {
      viewOptions.overrideCoinsBar = deferredWinBar;
    } else {
      viewOptions.overrideWinBar = deferredWinBar;
    }

    this.Parent(IHoldAndSpinRound).SetupViews(viewOptions);

    this.ContinueFromOnTransit();
  }

  ToRoundEnding() {
    return this.Transit(IHoldAndSpinRoundEnding);
  }

  private AtachCallbacks() {
    const hsBarViewEvents = this.RuntimeTryGetConst(IHoldAndSpinBarView.Events);
    if (hsBarViewEvents) {
      this.ReactOn(hsBarViewEvents.valueAnimDone, this.OnBarValueAnimDone);
    }
  }

  private ApplySpinCounterResetAfterNewFigure() {
    const winFiguresInfo = this.GetWinFiguresInfo();
    if (!winFiguresInfo.length) return;
    if (!this.HasMoreHoldSymbolsThanPreviousPhase(winFiguresInfo)) return;

    const hsBarView = this.RuntimeTryGet(IHoldAndSpinBarView);
    if (hsBarView) {
      const bet = this.Parent(IBetManager).GetCurrentBet();
      const initialSpins = this.Parent(IHoldAndSpinRound).GetRoundRules().GetConfig().initialSpins;

      hsBarView.SetValueNow(initialSpins * bet);
    }
  }

  private ContinueFromOnTransit() {
    this.ApplySpinCounterResetAfterNewFigure();

    const hsBarView = this.RuntimeTryGet(IHoldAndSpinBarView);
    if (hsBarView && hsBarView.IsValueAnimating()) {
      this.m_waitingBarValueAnim = true;
      return;
    }

    this.TransitLater(this.ToNextPhase());
  }

  private NextPhase() {
    const nvram = this.Nvram(HoldAndSpinRoundStorage);
    nvram.phaseIdx++;

    const roundResult = nvram.roundResult;
    if (!roundResult) return false;

    const phases = roundResult.GetPhases(this.GetRuntime());

    return IsValidIndex(phases, nvram.phaseIdx);
  }

  private UsesCoinsWinBar() {
    const triggerRound = this.RuntimeGetConst(IGameflow).GetConsecutiveTriggerRoundType();
    return triggerRound === RoundType.Coins || triggerRound === RoundType.CoinsFree;
  }

  private GetWinBarStartingValue() {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const currencyType = this.UsesCoinsWinBar() ? Currency.CoinsSpinEnergy : Currency.Credits;

    return gameflow.GetMatchCurrencyAvailable(currencyType);
  }

  private GetWinFiguresInfo(): SymbolViewInfos {
    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (!roundResult) return emptyInfos;

    const phases = roundResult.GetPhases(this.GetRuntime());
    if (!IsValidIndex(phases, nvram.phaseIdx)) return emptyInfos;

    const phase = phases[nvram.phaseIdx];
    if (!(phase instanceof HoldAndSpinPhase)) return emptyInfos;

    return phase.winFiguresInfo;
  }

  private HasMoreHoldSymbolsThanPreviousPhase(holdSymbolViewInfos: SymbolViewInfos) {
    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (!roundResult) return false;

    const phases = roundResult.GetPhases(this.GetRuntime());
    const prevPhaseIdx = nvram.phaseIdx - 1;

    if (IsValidIndex(phases, prevPhaseIdx)) {
      const prevPhase = phases[prevPhaseIdx];
      if (!(prevPhase instanceof HoldAndSpinPhase)) return false;

      const prevHoldCount = prevPhase.winFiguresInfo.length;
      return holdSymbolViewInfos.length > prevHoldCount;
    }

    if (!nvram.roundInput) return false;

    const triggerSymbolIds = this.ConstParent(IHoldAndSpinRound).GetRoundRules().GetConfig().triggerSymbolIds;
    const prevHoldCount = BaseReelRules.CountSymbols(nvram.roundInput.prevStop, triggerSymbolIds);

    return holdSymbolViewInfos.length > prevHoldCount;
  }

  private OnBarValueAnimDone() {
    if (!this.m_waitingBarValueAnim) return this.Skip();

    this.m_waitingBarValueAnim = false;
    return this.ToNextPhase();
  }

  private ToNextPhase() {
    if (this.NextPhase()) {
      return this.Transit(IHoldAndSpinRoundReeling);
    } else {
      return this.ToRoundEnding();
    }
  }

  private m_waitingBarValueAnim = false;
}

EgtALogCategoryClass(HoldAndSpinRoundPresentingState, 'HoldAndSpinRoundPresentingState');
