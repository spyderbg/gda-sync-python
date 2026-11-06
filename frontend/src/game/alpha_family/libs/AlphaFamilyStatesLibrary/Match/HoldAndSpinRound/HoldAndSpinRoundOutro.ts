// Egt::Game::AlphaFamily::HoldAndSpinRoundOutroState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRoundOutro):
// when the round's spins run out: the Grand or Major prize, the coins flying to the info screen, the free spins won,
// the big win, then the overlay's and the info screen's outros; else the next spin.

import { State } from '@game/engine/Fsm/Fsm';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { Contains } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, ERoundTags, RoundType, type SymbolViewInfos } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IHoldAndSpinRound, IHoldAndSpinRoundOutro } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IMatch } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatch';
import { IBigWinInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IBigWinInfoView.bridge';
import { IHoldAndSpinRoundInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { HoldAndSpinRoundOverlayTheme, IHoldAndSpinRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';
import { IBigWinView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';

function FreeSpinCurrencyForTriggerRound(triggerRoundType: RoundType): CurrencyType {
  switch (triggerRoundType) {
    case RoundType.Free: return Currency.FreeSpinEnergy;
    case RoundType.CoinsFree: return Currency.CoinsFreeSpinEnergy;
    case RoundType.ExtraFree: return Currency.ExtraFreeSpinEnergy;
    default: return Currency.FreeSpinEnergy;
  }
}

enum EOutroStep {
  None,
  SymbolPrize,
  Comets,
  FreeSpinsRewardSplash,
  BigWin,
  FeatureOutro,
}

const emptyInfos: SymbolViewInfos = [];

export class HoldAndSpinRoundOutroState extends State {
  static Interfaces = [IHoldAndSpinRoundOutro];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.Parent(IHoldAndSpinRound).GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.m_step = EOutroStep.None;
    this.m_overlayOutroFinished = false;
    this.m_infoOutroFinished = false;

    this.AttachCallbacks();

    const hsEnergy = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.HoldAndSpinEnergy);
    this.Parent(IHoldAndSpinRound).SetupViews({ disableInfoButton: true, showSpinsCompleted: (hsEnergy === 0) });
    if (hsEnergy === 0) {
      this.ShowSymbolPrize();
    } else {
      // Parent<IHoldAndSpinRound>().SetFeatureStartedViews(false);
      this.TransitLater(this.Parent(IMatch).ToNextRound());
    }
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(IBigWinView.Events).animatingDone, this.OnBigWinAnimatingDone);
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundInfoView.Events).cometsAnimDone, this.OnCometsFinished);
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundOverlayView.Events).outroMidway, this.OnOverlayOutroMidway);
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundOverlayView.Events).outroFinished, this.OnOverlayOutroFinished);
    this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundInfoView.Events).outroFinished, this.OnInfoOutroFinished);
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnFastStopRequested);
  }

  private GetWinFiguresInfo(): SymbolViewInfos {
    const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();
    const phases = lastResult.GetPhases(this.GetRuntime());
    if (!phases.length) return emptyInfos;

    const phase = phases[phases.length - 1];
    if (!(phase instanceof HoldAndSpinPhase)) return emptyInfos;

    return phase.winFiguresInfo;
  }

  private GetLastRoundTags(): ERoundTags[] {
    const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();
    return this.ConstParent(IHoldAndSpinRound).GetRoundRules().GetRoundTags(lastResult);
  }

  private GetFreeRoundsRewarded() {
    const currentBet = this.ConstParent(IBetManager).GetCurrentBet();
    if (AssertIf(currentBet === 0)) return 0;

    const gameflow = this.RuntimeGetConst(IGameflow);
    const triggerRoundType = this.ConstParent(IHoldAndSpinRound).GetTriggerRoundType();

    let rewarded = 0;
    switch (triggerRoundType) {
      case RoundType.Free: rewarded = gameflow.GetConsecutiveRoundAvailable(Currency.FreeSpinEnergy); break;
      case RoundType.CoinsFree:
        rewarded = gameflow.GetConsecutiveRoundAvailable(Currency.CoinsFreeSpinEnergy);
        break;
      case RoundType.ExtraFree:
        rewarded = gameflow.GetConsecutiveRoundAvailable(Currency.ExtraFreeSpinEnergy);
        break;
      default:
        rewarded = gameflow.GetConsecutiveRoundAvailable(Currency.FreeSpinEnergy);
        if (rewarded === 0) {
          rewarded = gameflow.GetConsecutiveRoundAvailable(Currency.CoinsFreeSpinEnergy);
        }
        if (rewarded === 0) {
          rewarded = gameflow.GetConsecutiveRoundAvailable(Currency.ExtraFreeSpinEnergy);
        }
        break;
    }

    return Math.trunc(rewarded / currentBet);
  }

  private static IsHoldAndSpinFromFreeGames(triggerRoundType: RoundType) {
    switch (triggerRoundType) {
      case RoundType.Free: // [[fallthrough]]
      case RoundType.CoinsFree: // [[fallthrough]]
      case RoundType.ExtraFree: return true;
      default: return false;
    }
  }

  private ShowSymbolPrize() {
    const tags = this.GetLastRoundTags();

    // only the bigger prize is shown when both are won
    if (Contains(tags, ERoundTags.GrandSymbolPrize)) {
      this.m_step = EOutroStep.SymbolPrize;
      this.ShowWinAnimation(ERoundTags.GrandSymbolPrize);
    } else if (Contains(tags, ERoundTags.MajorSymbolPrize)) {
      this.m_step = EOutroStep.SymbolPrize;
      this.ShowWinAnimation(ERoundTags.MajorSymbolPrize);
    } else {
      this.ShowComets();
    }
  }

  private ShowComets() {
    this.m_step = EOutroStep.Comets;

    const winFiguresInfo = this.GetWinFiguresInfo();
    this.RuntimeGet(IWinFiguresView).ShowComets(winFiguresInfo);
    this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowComets(winFiguresInfo);
  }

  private ShowFreeSpinsRewardSplash() {
    const freeRoundsCount = this.GetFreeRoundsRewarded();
    if (freeRoundsCount <= 0) {
      this.ShowBigWin();
      return;
    }

    this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowOutro();

    const triggerRoundType = this.Parent(IHoldAndSpinRound).GetTriggerRoundType();
    const theme = HoldAndSpinRoundOutroState.IsHoldAndSpinFromFreeGames(triggerRoundType)
      ? HoldAndSpinRoundOverlayTheme.FreeSpinsAdditionalSpins
      : HoldAndSpinRoundOverlayTheme.FreeSpinsWon;

    this.m_step = EOutroStep.FreeSpinsRewardSplash;
    const overlay = this.RuntimeGet(IHoldAndSpinRoundOverlayView);
    overlay.SetRewardedAmount(freeRoundsCount, FreeSpinCurrencyForTriggerRound(triggerRoundType));
    overlay.SetTheme(theme);
  }

  private ShowBigWin() {
    if (Contains(this.GetLastRoundTags(), ERoundTags.BigWin)) {
      this.m_step = EOutroStep.BigWin;
      this.ShowWinAnimation(ERoundTags.BigWin);
    } else {
      this.ShowFeatureOutro();
    }
  }

  private ShowFeatureOutro() {
    this.m_step = EOutroStep.FeatureOutro;

    this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowOutro();
    this.RuntimeGet(IHoldAndSpinRoundOverlayView).ShowOutro();
  }

  private ShowWinAnimation(tag: ERoundTags) {
    this.RuntimeGet(IBigWinView).ShowAnimation(tag);

    const bigWinInfoView = this.RuntimeTryGet(IBigWinInfoView);
    if (bigWinInfoView) {
      bigWinInfoView.ShowAnimation(tag);
    }
  }

  private TryFinish() {
    if (!this.m_overlayOutroFinished || !this.m_infoOutroFinished) return;

    this.m_step = EOutroStep.None;
    this.TransitLater(this.Parent(IMatch).ToNextRound());
  }

  private OnBigWinAnimatingDone() {
    switch (this.m_step) {
      case EOutroStep.SymbolPrize: this.ShowComets(); return this.Consume();
      case EOutroStep.BigWin: this.ShowFeatureOutro(); return this.Consume();
      default: return this.Skip();
    }
  }

  private OnCometsFinished() {
    if (this.m_step !== EOutroStep.Comets) return this.Skip();

    this.ShowFreeSpinsRewardSplash();
    return this.Consume();
  }

  private OnOverlayOutroMidway() {
    if (this.m_step === EOutroStep.FreeSpinsRewardSplash) {
      this.Parent(IHoldAndSpinRound).SetFeatureStartedViews(false);
      return this.Consume();
    }

    if (this.m_step !== EOutroStep.FeatureOutro) return this.Skip();

    this.Parent(IHoldAndSpinRound).SetFeatureStartedViews(false);
    return this.Consume();
  }

  private OnOverlayOutroFinished() {
    if (this.m_step === EOutroStep.FreeSpinsRewardSplash) {
      this.m_step = EOutroStep.None;
      this.TransitLater(this.Parent(IMatch).ToNextRound());
      return this.Consume();
    }

    if (this.m_step !== EOutroStep.FeatureOutro) return this.Skip();

    this.m_overlayOutroFinished = true;
    this.TryFinish();
    return this.Consume();
  }

  private OnInfoOutroFinished() {
    if (this.m_step !== EOutroStep.FeatureOutro) return this.Forward();

    this.m_infoOutroFinished = true;
    this.TryFinish();
    return this.Forward();
  }

  private OnFastStopRequested() {
    if (this.m_step === EOutroStep.Comets) {
      this.RuntimeGet(IWinFiguresView).RequestFastForwardComets();
      this.RuntimeGet(IHoldAndSpinRoundInfoView).RequestFastForwardComets();
    }

    return this.Consume();
  }

  private m_step = EOutroStep.None;
  private m_overlayOutroFinished = false;
  private m_infoOutroFinished = false;
}

EgtALogCategoryClass(HoldAndSpinRoundOutroState, 'HoldAndSpinRoundOutroState');
