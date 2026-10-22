// Egt::Game::AlphaFamily::HoldAndSpinRoundPresentingState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundPresenting):
// accumulates the phase's win, shows the coins that landed and the big win, then the next phase's reeling or the
// round's ending.

import { State } from '@game/engine/Fsm/Fsm';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, PayoutSummary, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import { BaseReelRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/Rules/BaseReelRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import {
  IHoldAndSpinRound, IHoldAndSpinRoundEnding, IHoldAndSpinRoundPresenting, IHoldAndSpinRoundReeling,
} from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { ICoinsWinBarView, ICreditsWinBarView, IHoldAndSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBigWinInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IBigWinInfoView.bridge';
import { IBigWinView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

const emptySummary = new PayoutSummary();
const emptyInfos: SymbolViewInfos = [];

export class HoldAndSpinRoundPresentingState extends State {
  static Interfaces = [IHoldAndSpinRoundPresenting];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AtachCallbacks();

    const winBarStarting = this.GetWinBarStartingValue();
    this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true, overrideWinBar: winBarStarting, showMainInfo: true });

    this.StartAccumulationAnim();
  }

  ToRoundEnding() {
    return this.Transit(IHoldAndSpinRoundEnding);
  }

  private AtachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(ICreditsWinBarView.Events).animatingDone, this.OnAccumulationEnd);
    this.ReactOn(this.RuntimeGetConst(IWinFiguresView.Events).animatingDone, this.OnWinFiguresAnimatingDone);
    this.ReactOn(this.RuntimeGetConst(IBigWinView.Events).animatingDone, this.OnBigWinAnimatingDone);

    const coinsBarViewEvents = this.RuntimeTryGetConst(ICoinsWinBarView.Events);
    if (coinsBarViewEvents) {
      this.ReactOn(coinsBarViewEvents.animatingDone, this.OnAccumulationEnd);
    }
  }

  private StartAccumulationAnim() {
    const summary = this.GetPayoutSummary();

    if (summary.rewards.Get(Currency.Credits) > 0) {
      this.RuntimeGet(ICreditsWinBarView).AddWinResult(summary);
    } else if (summary.rewards.Get(Currency.CoinsSpinEnergy) > 0) {
      this.RuntimeGet(ICoinsWinBarView).AddWinResult(summary);
    } else {
      this.CheckWinFiguresAnim();
    }
  }

  private NextPhase() {
    const nvram = this.Nvram(HoldAndSpinRoundStorage);
    nvram.phaseIdx++;

    const roundResult = nvram.roundResult;
    if (!roundResult) return false;

    const phases = roundResult.GetPhases(this.GetRuntime());

    return IsValidIndex(phases, nvram.phaseIdx);
  }

  private GetWinBarStartingValue() {
    const currencyType = Currency.Credits;
    let result = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(currencyType);

    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (!roundResult) return result;

    const phases = roundResult.GetPhases(this.GetRuntime());

    for (let i = 0; i < nvram.phaseIdx; i++) {
      if (!IsValidIndex(phases, i)) break;
      if (!(phases[i] instanceof HoldAndSpinPhase)) continue;

      const rewards = (phases[i] as HoldAndSpinPhase).summary.rewards;
      result += rewards.Get(currencyType);
    }

    return result;
  }

  private GetPayoutSummary(): PayoutSummary {
    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (!roundResult) return emptySummary;

    const phases = roundResult.GetPhases(this.GetRuntime());
    if (!IsValidIndex(phases, nvram.phaseIdx)) return emptySummary;

    const phase = phases[nvram.phaseIdx];
    if (!(phase instanceof HoldAndSpinPhase)) return emptySummary;

    return phase.summary;
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

  private OnAccumulationEnd(_value: number) {
    return this.CheckWinFiguresAnim();
  }

  private CheckWinFiguresAnim() {
    const winFiguresInfo = this.GetWinFiguresInfo();

    if (winFiguresInfo.length) {
      const hasResetSpinFigureHit = (() => {
        const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
        const roundResult = nvram.roundResult;
        if (!roundResult) return false;

        const phases = roundResult.GetPhases(this.GetRuntime());
        const prevPhaseIdx = nvram.phaseIdx - 1;

        if (IsValidIndex(phases, prevPhaseIdx)) {
          const prevPhase = phases[prevPhaseIdx];
          if (!(prevPhase instanceof HoldAndSpinPhase)) return false;

          const prevResetFigCount = prevPhase.winFiguresInfo.length;
          return winFiguresInfo.length > prevResetFigCount;
        }

        if (!nvram.roundInput) return false;

        const triggerSymbolIds = this.Parent(IHoldAndSpinRound).GetRoundRules().GetConfig().triggerSymbolIds;
        const prevResetFigCount = BaseReelRules.CountSymbols(nvram.roundInput.prevStop, triggerSymbolIds);

        return winFiguresInfo.length > prevResetFigCount;
      })();

      if (hasResetSpinFigureHit) {
        const hsBarView = this.RuntimeTryGet(IHoldAndSpinBarView);
        if (hsBarView) {
          const bet = this.Parent(IBetManager).GetCurrentBet();
          const initialSpins = this.Parent(IHoldAndSpinRound).GetRoundRules().GetConfig().initialSpins;

          hsBarView.SetValueNow(initialSpins * bet);
        }
      }

      this.RuntimeGet(IWinFiguresView).ShowWinFigures(winFiguresInfo);
      this.RuntimeGet(IReelsView).ShowCombinations(winFiguresInfo); // hide symbols from underneath
      return this.Consume();
    } else {
      return this.CheckBigWin();
    }
  }

  private OnWinFiguresAnimatingDone() {
    return this.CheckBigWin();
  }

  private CheckBigWin() {
    const roundResult = this.ConstNvram(HoldAndSpinRoundStorage).roundResult;
    const roundRules = this.Parent(IHoldAndSpinRound).GetRoundRules();
    const tags = roundRules.GetRoundTags(roundResult!);

    if (tags.length) {
      this.RuntimeGet(IBigWinView).ShowAnimation(tags[tags.length - 1]);

      const bigWinUnfoldedView = this.RuntimeTryGet(IBigWinInfoView);
      if (bigWinUnfoldedView) {
        bigWinUnfoldedView.ShowAnimation(tags[tags.length - 1]);
      }
      return this.Consume();
    } else {
      return this.OnBigWinAnimatingDone();
    }
  }

  private OnBigWinAnimatingDone() {
    if (this.NextPhase()) {
      return this.Transit(IHoldAndSpinRoundReeling);
    } else {
      return this.ToRoundEnding();
    }
  }
}

EgtALogCategoryClass(HoldAndSpinRoundPresentingState, 'HoldAndSpinRoundPresentingState');
