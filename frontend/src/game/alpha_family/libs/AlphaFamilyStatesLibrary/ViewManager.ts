// Egt::Game::AlphaFamily::ViewManager (AlphaFamilyStatesLibrary/ViewManager.h/.cpp): sets up every view for a round
// type or a round result, as a state asks with its SetupViewsOptions.

import { Event } from '@game/engine/Core/Event';
import { type Reaction, State } from '@game/engine/Fsm/Fsm';
import { Currencies, type CurrencyType } from '@game/engine/Game/Math/Common.data';
import {
  HwButtonLight, IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IDecreaseBetHwButton, IExitHwButton, IGambleBlackHwButton, IGambleHwButton,
  IGambleRedHwButton, IIncreaseBetHwButton, IInfoHwButton, IMaxBetHwButton, IStartHwButton,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IResponsibleGaming } from '@game/engine/Game/RuntimeImport/IResponsibleGaming';
import { IWallet } from '@game/engine/Game/RuntimeImport/IWallet';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import type { ConstPointer, int64_t, Pointer, uint32_t } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { CombinationType, Currency, ELeftStatusLine, ERightStatusLine, EStatusLine, type Reels, RoundType, type SymbolGrid } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundInput.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { type ReelCombinations, SpinReelsPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { GameManagerNvrams, IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager, type IViewManagerEvents, type SetupViewsOptions, ViewManagerStatics } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import {
  EWinBarState, IBetBarView, type IBaseCounterBarView, ICoinsBarView, ICoinsFreeSpinBarView, ICoinsWinBarView, ICreditBarView, ICreditsWinBarView,
  IExtraFreeSpinBarView, IExtraSpinBarView, IFreeSpinBarView, IHoldAndSpinBarView,
} from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBetMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { IBigWinInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IBigWinInfoView.bridge';
import { IExtraRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IExtraRoundOverlayView.bridge';
import { IFreeRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundOverlayView.bridge';
import { IFreeRoundRetriggerView } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundRetriggerView.bridge';
import { IGambleRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundOverlayView.bridge';
import {
  ECurrencyPrize as HoldAndSpinECurrencyPrize, IHoldAndSpinRoundInfoView, type PaytableCoefficients as HoldAndSpinPaytableCoefficients,
} from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { IHoldAndSpinRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';
import { ECurrencyPrize, type FigureId, IInfoView, type PaytableCoefficients } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { ILanguageMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { IBigWinView, IKnobsView, ITetraRoundOverlayView, ITopperView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { ITetraRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import { IWheelRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundOverlayView.bridge';
import { IWheelRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import {
  IBetDownSwButtonView, IBetUpSwButtonView, IExitGameSwButtonView, IExitTetraSwButtonView, IGambleBlackSwButtonView, IGambleRedSwButtonView,
  IInfoSwButtonView, ILanguageSwButtonView, ILineDownSwButtonView, ILineUpSwButtonView, IResponsibleSwButtonView, ISoundVolumeSwButtonView,
  IStopSingleReelSwButtonView, ITakeCoinsSwButtonView, IWheelCancelSwButtonView, IWheelStartSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

function IsInMatchTakeWin(roundType: RoundType, options: SetupViewsOptions) {
  return (options.overrideSpecialRoundView ?? roundType) === RoundType.Gamble;
}

function IsInGamble(roundType: RoundType, options: SetupViewsOptions) {
  void options;
  return roundType === RoundType.Gamble;
}

function IsInTetra(roundType: RoundType, options: SetupViewsOptions) {
  return (options.overrideSpecialRoundView ?? roundType) === RoundType.Tetra;
}

/** The options' defaults, as SetupViewsOptions initializes its members. */
function WithDefaults(options: SetupViewsOptions): SetupViewsOptions {
  return { showSpinReelsCombinations: true, setupOverlay: true, setupReels: true, changeCreditBar: true, statusLine: EStatusLine.None, ...options };
}

interface FreeSpinViewAndCurrency {
  currency: CurrencyType;
  getter: () => Pointer<IBaseCounterBarView>;
}

const emptyReels: Reels = [];

export class ViewManager extends State implements IViewManager, IViewManagerEvents {
  static Interfaces = [IViewManager, IViewManager.Events];
  static Statics = [ViewManagerStatics];

  readonly betMenuStateChanged = new Event();
  readonly languageMenuStateChanged = new Event();

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();
  }

  SetupViews(roundResultOrType: RoundResult | RoundType, options: SetupViewsOptions) {
    if (roundResultOrType instanceof RoundResult) {
      const result = roundResultOrType;
      this.SetupViewsFor(result.GetTriggerRoundType(), result, WithDefaults(options));
      return;
    }
    const roundType = roundResultOrType;
    const nvrams = this.ConstNvram(GameManagerNvrams);
    const mathRules = this.RuntimeGet(IMathRules);

    let correspondingReelRoundType: RoundType;
    switch (roundType) {
      case RoundType.Undefined: correspondingReelRoundType = RoundType.Main; break;
      case RoundType.Gamble:
        {
          // For a Gamble round, determine the corresponding reel round type based on the last result of the Main
          // slot. For Coin games this may be a Coin round with a paytable in Credits.
          const slot = mathRules.GetReelRoundRules(RoundType.Main).GetLastResultSlot();
          if (AssertIf(!IsValidIndex(nvrams.lastRoundResults, slot))) return;
          correspondingReelRoundType = nvrams.lastRoundResults[slot].GetRoundType();
        }
        break;

      case RoundType.Wheel: correspondingReelRoundType = RoundType.Coins; break;
      case RoundType.Tetra: correspondingReelRoundType = RoundType.Main; break;
      default: correspondingReelRoundType = roundType; break;
    }

    const slot = mathRules.GetReelRoundRules(correspondingReelRoundType).GetLastResultSlot();
    if (AssertIf(!IsValidIndex(nvrams.lastRoundResults, slot))) return;
    this.SetupViewsFor(correspondingReelRoundType, nvrams.lastRoundResults[slot], WithDefaults(options));
  }

  SetupViewsLastResult(options: SetupViewsOptions) {
    const result = this.Parent(IGameManager).GetLastRoundResult();

    this.SetupViewsFor(result.GetTriggerRoundType(), result, WithDefaults(options));
  }

  private AttachCallbacks() {
    this.ReactOn(this.RuntimeGetConst(ILanguageSwButtonView.Events).buttonPressedEvent, this.OnLanguageSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IBetUpSwButtonView.Events).buttonPressedEvent, this.OnBetButtonPressed);
    this.ReactOn(this.RuntimeGetConst(IBetDownSwButtonView.Events).buttonPressedEvent, this.OnBetButtonPressed);

    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).menuOpened, this.OnBetMenuOpened);
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).menuClosed, this.OnBetMenuClosed);
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).menuOpening, this.OnBetMenuMoving);
    this.ReactOn(this.RuntimeGetConst(IBetMenuView.Events).menuClosing, this.OnBetMenuMoving);

    this.ReactOn(this.RuntimeGetConst(ILanguageMenuView.Events).menuOpened, this.OnLanguageMenuOpened);
    this.ReactOn(this.RuntimeGetConst(ILanguageMenuView.Events).menuClosed, this.OnLanguageMenuClosed);
    this.ReactOn(this.RuntimeGetConst(ILanguageMenuView.Events).menuOpening, this.OnLanguageMenuMoving);
    this.ReactOn(this.RuntimeGetConst(ILanguageMenuView.Events).menuClosing, this.OnLanguageMenuMoving);

    if (this.RuntimeTryGet(IHoldAndSpinRoundInfoView)) {
      this.ReactOn(this.RuntimeGetConst(IHoldAndSpinRoundInfoView.Events).outroFinished, this.OnHoldAndSpinInfoAnimEnd);
    }
    if (this.RuntimeTryGet(ICreditBarView)) {
      this.ReactOn(this.RuntimeGetConst(ICreditBarView.Events).animatingDone, this.OnWinAccumulationAnimEnd);
      this.ReactOn(this.RuntimeGetConst(ICreditBarView.Events).animatingInstantDone, this.OnWinAccumulationAnimInstantEnd);
    }
    if (this.RuntimeTryGet(ICoinsWinBarView)) {
      this.ReactOn(this.RuntimeGetConst(ICoinsWinBarView.Events).animatingDone, this.OnWinAccumulationAnimEnd);
      this.ReactOn(this.RuntimeGetConst(ICoinsWinBarView.Events).animatingInstantDone, this.OnWinAccumulationAnimInstantEnd);
    }
  }

  private OnLanguageSwButtonPressed() {
    const statics = this.Static(ViewManagerStatics);

    if (statics.languageMenuVisible) {
      this.RuntimeGet(ILanguageMenuView).CloseMenu();
    } else {
      this.RuntimeGet(ILanguageMenuView).OpenMenu();
    }

    return this.Consume();
  }

  private OnBetButtonPressed() {
    if (this.Static(ViewManagerStatics).betMenuVisible) {
      this.RuntimeGet(IBetMenuView).CloseMenu();
    } else {
      this.RuntimeGet(IBetMenuView).OpenMenu();
    }

    return this.Consume();
  }

  private OnLanguageMenuOpened() {
    this.Static(ViewManagerStatics).languageMenuVisible = true;
    this.Static(ViewManagerStatics).languageMenuMoving = false;
    this.languageMenuStateChanged.Post();

    return this.Consume();
  }

  private OnLanguageMenuClosed() {
    this.Static(ViewManagerStatics).languageMenuVisible = false;
    this.Static(ViewManagerStatics).languageMenuMoving = false;
    this.languageMenuStateChanged.Post();

    this.RuntimeGet(ILanguageSwButtonView).ResetButtonState();

    return this.Consume();
  }

  private OnLanguageMenuMoving() {
    this.Static(ViewManagerStatics).languageMenuMoving = true;
    this.languageMenuStateChanged.Post();

    return this.Consume();
  }

  private OnBetMenuOpened() {
    this.Static(ViewManagerStatics).betMenuVisible = true;
    this.Static(ViewManagerStatics).betMenuMoving = false;
    this.betMenuStateChanged.Post();

    return this.Consume();
  }

  private OnBetMenuClosed() {
    this.Static(ViewManagerStatics).betMenuVisible = false;
    this.Static(ViewManagerStatics).betMenuMoving = false;
    this.betMenuStateChanged.Post();

    this.RuntimeGet(IBetUpSwButtonView).ResetButtonState();
    this.RuntimeGet(IBetDownSwButtonView).ResetButtonState();

    return this.Consume();
  }

  private OnBetMenuMoving() {
    this.Static(ViewManagerStatics).betMenuMoving = true;
    this.betMenuStateChanged.Post();

    return this.Consume();
  }

  private OnHoldAndSpinInfoAnimEnd() {
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(true);

    return this.Consume();
  }

  private OnWinAccumulationAnimEnd(_value: int64_t): Reaction {
    this.RuntimeGet(ILinesView).StopWinLinesSounds('AccumulationEnd');
    return this.Forward();
  }

  private OnWinAccumulationAnimInstantEnd(_value: int64_t): Reaction {
    this.RuntimeGet(ILinesView).StopWinLinesSounds('AccumulationInstantEnd');
    return this.Forward();
  }

  private SetupViewsFor(roundType: RoundType, result: RoundResult, options: SetupViewsOptions) {
    this.SetupBets(roundType, options);

    if (options.blockGameInput) {
      this.BlockGameButtons(roundType, options);
    } else {
      if (options.enableButtons) {
        this.SetupButtons(roundType, options);
      } else {
        this.DisableButtons(roundType, options);
      }
    }
    this.SetupCurrencyValues(roundType, options);
    this.SetupBetMenuView(roundType, options);
    this.SetupKnobsView(roundType);
    this.SetupStatusLineView(result, options);
    this.SetupInfoView(roundType, options);
    this.SetupTopperView();
    this.SetupWinCombination(result, options);
    this.SetupSpecialRoundView(result, options);

    if (options.setupOverlay) {
      this.SetupOverlayView();
    }

    if (options.setupReels) {
      this.SetupReelsView(roundType, result, options);
    }
  }

  private SetupBets(roundType: RoundType, options: SetupViewsOptions) {
    if (this.IsWheelRoundView(roundType, options)) return; // handled in WheelRound
    if (IsInTetra(roundType, options)) return; // handled in TetraRound

    const mathRules = this.RuntimeGetConst(IMathRules);
    const rules = mathRules.GetReelRoundRules(roundType);
    const limits = this.RuntimeGetConst(ILimits).GetBetLimits();
    const gameflow = this.RuntimeGetConst(IGameflow);
    const available = this.GetAvailableCredits(roundType);

    const maxBetMultiplier = rules.GetMaxBetMultiplier();
    const maxBet = maxBetMultiplier > 0
      ? Math.min(gameflow.GetInitialCreditsBet() * maxBetMultiplier, limits.maxBet)
      : limits.maxBet;
    const minBetMultiplier = rules.GetMinBetMultiplier();
    const minBet = minBetMultiplier > 0
      ? Math.max(gameflow.GetInitialCreditsBet() * minBetMultiplier, limits.minBet)
      : limits.minBet;

    const bets = rules.GetAllowedBets(minBet, maxBet);

    if (!bets.length) {
      console.assert(false, 'Kernel bet limits incompatible with rules config?');
      bets.push(rules.GetMinBet());
    }

    const betManager = this.Parent(IBetManager);
    betManager.SetEditMode(!!options.enableButtons);
    betManager.SetAllowedBets(bets);
    betManager.SetAllowedLines(rules.GetAllowedLines());
    const betLimit = gameflow.IsIdle() && available === 0 ? limits.maxBet : available;
    betManager.SetBetLimit(betLimit);
    betManager.SetBetCurrency(rules.GetBetBarCurrencyType());
  }

  private SetupReelsView(roundType: RoundType, roundResult: RoundResult, options: SetupViewsOptions) {
    if (options.overrideSpecialRoundView === RoundType.Tetra) return;
    if (options.overrideFakeReels === RoundType.Tetra) return;
    if (roundResult.GetRoundType() === RoundType.Tetra) return;
    if (roundType === RoundType.Tetra) return;

    const phases = roundResult.GetPhases(this.GetRuntime());
    if (AssertIf(!phases.length)) return;

    const mathRules = this.RuntimeGetConst(IMathRules);
    const fakeReels = (() => {
      if (options.overrideFakeReels !== undefined) {
        return options.overrideFakeReels === RoundType.HoldAndSpin
          ? mathRules.GetHoldAndSpinRoundRules(roundResult.GetTriggerRoundType()).GetFakeReels()
          : mathRules.GetReelRoundRules(options.overrideFakeReels).GetFakeReels();
      }
      const input = roundResult.GetInput();
      if (input instanceof ReelRoundInput) {
        const roundRules = mathRules.GetReelRoundRules(input.roundType);
        return roundRules.GetFakeReels();
      }
      if (input instanceof HoldAndSpinRoundInput) {
        const roundRules = mathRules.GetHoldAndSpinRoundRules(input.triggerRoundType);
        return roundRules.GetFakeReels();
      }
      return emptyReels;
    })();

    // C++ visits the first phase's variant
    const phase = phases[0];
    let beforeStop: SymbolGrid = [];
    let afterStop: SymbolGrid = [];
    let stop: SymbolGrid = [];
    if (phase instanceof SpinReelsPhase) {
      beforeStop = phase.beforeStop;
      afterStop = phase.afterStop;
      stop = options.showInitialStop ? phase.initialStop : phase.stop;
    } else if (phase instanceof HoldAndSpinPhase) {
      stop = phase.stop;
    }

    const reelsView = this.RuntimeGet(IReelsView);
    reelsView.SetupFakeReels(fakeReels);
    reelsView.SetStopFigures(stop);
    reelsView.SetSymbolsAroundStop(beforeStop, afterStop);
    reelsView.ClearHoldAndSpinSymbols();

    if (options.startReeling) {
      reelsView.StartReeling();
    } else {
      reelsView.ShowStopFigures();
    }

    if (options.stopFirstReel) {
      reelsView.StartNormalReelingStop(0);
    }
  }

  private SetupCurrencyValues(roundType: RoundType, options: SetupViewsOptions) {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const available = gameflow.IsIdle() ? new Currencies() : gameflow.GetMatchCurrenciesAvailable();
    const credits = options.overrideCredits ?? this.RuntimeGetConst(IWallet).GetCredit();
    const isReelingMain = options.startReeling && roundType === RoundType.Main;

    // winbar
    const winBar = this.RuntimeGet(ICreditsWinBarView);

    if (options.overrideWinBar !== undefined) {
      winBar.SetValueNow(options.overrideWinBar);
      winBar.SetLabelState(EWinBarState.Win);
    } else if (gameflow.IsIdle() || isReelingMain) {
      const lastWin = this.Parent(IGameManager).GetLastMatchWin();

      winBar.SetValueNow(lastWin);
      winBar.SetLabelState(lastWin > 0 ? EWinBarState.WinnerPaid : EWinBarState.Win);
    } else {
      const rewarded = gameflow.GetMatchCurrencyRewarded(Currency.Credits);
      const consumed = gameflow.GetMatchCurrencyConsumed(Currency.Credits);

      winBar.SetValueNow(rewarded - consumed);
      winBar.SetLabelState(EWinBarState.Win);
    }

    // credits
    {
      const creditView = this.RuntimeTryGet(ICreditBarView);
      if (creditView && options.changeCreditBar) {
        creditView.SetValueNow(credits);
      }
    }

    const coins = options.overrideCoinsBar ?? available.Get(Currency.CoinsSpinEnergy);

    // coins & credits behaviour
    const creditView = this.RuntimeTryGet(ICreditBarView);
    const coinsView = this.RuntimeTryGet(ICoinsBarView);

    const isBettingCoins = this.Parent(IBetManager).GetBetCurrency() === Currency.CoinsSpinEnergy;
    const isMatchTakeWin = IsInMatchTakeWin(roundType, options);
    const isWinningCoins = coins > 0;

    if ((isBettingCoins || isWinningCoins) && !isMatchTakeWin) {
      if (creditView) {
        creditView.Minimize(false);
      }

      if (coinsView) {
        coinsView.SetValueNow(coins);
        coinsView.Maximize(false);
      }
    } else {
      if (creditView) {
        creditView.Maximize(false);
      }
      if (coinsView) {
        coinsView.SetValueNow(coins);
        coinsView.Minimize(false);
      }
    }

    // extra
    const extraSpinView = this.RuntimeTryGet(IExtraSpinBarView);
    if (extraSpinView) {
      extraSpinView.SetValueNow(available.Get(Currency.ExtraSpinEnergy));
      extraSpinView.ShowRemainder(false);
    }

    // hold and spin
    const hsSpinView = this.RuntimeTryGet(IHoldAndSpinBarView);
    if (hsSpinView) {
      hsSpinView.SetBet(this.Parent(IBetManager).GetCurrentBet());
      hsSpinView.SetValueNow(available.Get(Currency.HoldAndSpinEnergy));
      hsSpinView.ShowRemainder(false);
    }
  }

  private SetupBetMenuView(roundType: RoundType, options: SetupViewsOptions) {
    if (this.IsWheelRoundView(roundType, options)) return; // handled in WheelRound
    if (IsInTetra(roundType, options)) return; // handled in TetraRound

    const betManager = this.Parent(IBetManager);
    const mathRules = this.RuntimeGetConst(IMathRules);
    const rules = mathRules.GetReelRoundRules(roundType);

    const menu = this.RuntimeGet(IBetMenuView);
    const currentBet = betManager.GetCurrentBet();
    const allowedBets = betManager.GetAllowedBetsIncludingSelected();
    const minAllowedBet = allowedBets[0];
    const maxAllowedBet = allowedBets[allowedBets.length - 1];
    menu.SetPossibleTotalBets(betManager.GetAllowedBetsIncludingSelected());
    menu.SetPossibleLines(rules.GetAllowedLines());
    menu.SetSelectedTotalBet(currentBet);
    menu.SetBetLimit(betManager.GetBetLimit());
    menu.SetSelectedLines(betManager.GetCurrentLines());
    menu.SetCurrency(betManager.GetBetCurrency());
    if (options.startReeling) {
      menu.CloseMenu();
    }
    const previewAllBets = this.RuntimeGetConst(IGameflow).IsIdle() && this.RuntimeGetConst(IWallet).GetCredit() === 0;
    const canChangeBetUp = currentBet < betManager.GetMaxBet() || (previewAllBets && currentBet < maxAllowedBet);
    menu.SetButtonUpEnabled(canChangeBetUp);
    const canChangeBetDown = currentBet > betManager.GetMinBet() || (previewAllBets && currentBet > minAllowedBet);
    menu.SetButtonDownEnabled(canChangeBetDown);

    const bar = this.RuntimeGet(IBetBarView);
    bar.SetValueNow(betManager.GetCurrentBet());
    bar.SetCurrency(betManager.GetBetCurrency());
    bar.SetSkin('');
  }

  private SetupKnobsView(_roundType: RoundType) {
    this.RuntimeGet(IKnobsView).SetVisible(true);
  }

  private SetupStatusLineView(roundResult: RoundResult, options: SetupViewsOptions) {
    if (this.IsWheelRoundView(roundResult.GetRoundType(), options)) return;

    const statusLineView = this.RuntimeTryGet(IStatusLineView);
    if (!statusLineView) return;

    statusLineView.SetVisible(true);

    this.SetupLeftStatusLine(options);
    this.SetupMidStatusLine(roundResult, options);
    this.SetupRightStatusLine(roundResult.GetRoundType(), options);
  }

  private SetupInfoView(roundType: RoundType, options: SetupViewsOptions) {
    const betManager = this.Parent(IBetManager);
    const currentBet = betManager.GetCurrentBet();
    const currentLines = betManager.GetCurrentLines();
    if (currentBet === 0 || currentLines === 0) return; // during startup they are 0, will be set soon after

    const limits = this.RuntimeGet(ILimits);
    const capping = limits.GetWinCapping().capping;

    const infoScreen = this.RuntimeGet(IInfoView);
    infoScreen.SetWinCappingLimit(capping);
    infoScreen.SetStakes(currentBet, currentLines);

    // SetupInfoViewPaytables needs to be called after we set the stakes
    this.SetupInfoViewPaytables(roundType);

    const mathRules = this.RuntimeGetConst(IMathRules);
    const maxGambleAttempts = mathRules.HasWheelRoundRules(RoundType.Gamble)
      ? mathRules.GetWheelRoundRules(RoundType.Gamble).GetMaxAttempts()
      : 0;

    infoScreen.SetGambleCapLimit(capping / 2);
    infoScreen.SetGambleLimits(capping, maxGambleAttempts);

    if (options.autoSelectInfoPage) {
      infoScreen.ShowRoundInfo(options.overrideSpecialRoundView ?? roundType, true);
    }
    infoScreen.HideWins();

    const hsInfoView = this.RuntimeTryGet(IHoldAndSpinRoundInfoView);
    if (hsInfoView) {
      hsInfoView.SetStakes(currentBet, currentLines);
    }
  }

  private SetupTopperView() {
    const topperView = this.RuntimeTryGet(ITopperView);
    if (topperView) {
      topperView.RefreshAnimations();
    }
  }

  private SetupInfoViewPaytables(roundType: RoundType) {
    const infoScreenPaytables: Map<ECurrencyPrize, PaytableCoefficients> = new Map();
    const currencyTransform: Map<CurrencyType, ECurrencyPrize> = new Map([
      [Currency.Undefined, ECurrencyPrize.Undefined],
      [Currency.Credits, ECurrencyPrize.Credits],
      [Currency.ExtraSpinEnergy, ECurrencyPrize.ExtraSpinsEnergy],
      [Currency.FreeSpinEnergy, ECurrencyPrize.FreeSpinsEnergy],
      [Currency.CoinsSpinEnergy, ECurrencyPrize.CoinsSpinEnergy],
      [Currency.CoinsFreeSpinEnergy, ECurrencyPrize.CoinsFreeSpinEnergy],
    ]);

    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    for (const mathPayTable of rules.GetConfig().lineConfig.linePayTables) {
      const first = currencyTransform.has(mathPayTable.currencyType) ? currencyTransform.get(mathPayTable.currencyType)! : ECurrencyPrize.Undefined;
      const second: PaytableCoefficients = new Map();
      for (let mathFigId = 0; mathFigId < mathPayTable.symbolCountPayout.length; ++mathFigId) {
        const mathFigCoef = mathPayTable.symbolCountPayout[mathFigId];
        second.set(mathFigId, [...mathFigCoef]); // copy
      }

      infoScreenPaytables.set(first, second);
    }

    for (const mathPayTable of rules.GetConfig().scatterConfig.scatterPayTables) {
      const prizeType = currencyTransform.has(mathPayTable.currencyType) ? currencyTransform.get(mathPayTable.currencyType)! : ECurrencyPrize.Undefined;
      for (const [figId, mathFigCoeff] of mathPayTable.symbolCountPayout) {
        if (!infoScreenPaytables.has(prizeType)) infoScreenPaytables.set(prizeType, new Map());
        infoScreenPaytables.get(prizeType)!.set(figId, [...mathFigCoeff]);
      }
    }

    const infoScreenScatterFigures = new Set<FigureId>();
    for (const mathScatter of rules.GetConfig().scatterConfig.scatterSymbols) {
      infoScreenScatterFigures.add(mathScatter.symbolId);
    }

    const infoScreenFigureNames = new Map<FigureId, string>();
    for (const mathSymbol of rules.GetConfig().spinConfig.symbols) {
      infoScreenFigureNames.set(mathSymbol.id, mathSymbol.name.toLowerCase());
    }

    const infoScreenGameMultipliers: uint32_t[] = [1];
    for (const wild of rules.GetConfig().lineConfig.wildSymbols) {
      for (const m of wild.multipliers.data) {
        infoScreenGameMultipliers.push(m.factor);
      }
    }

    if (this.RuntimeGetConst(IMathRules).HasHoldAndSpinRules(roundType)) {
      const hsRules = this.RuntimeGetConst(IMathRules).GetHoldAndSpinRoundRules(roundType);
      for (const mathPayTable of hsRules.GetConfig().paytable) {
        const prizeType = currencyTransform.has(mathPayTable.currencyType) ? currencyTransform.get(mathPayTable.currencyType)! : ECurrencyPrize.Undefined;
        for (const [figId, mathFigCoeff] of mathPayTable.symbolCountPayout) {
          if (!infoScreenPaytables.has(prizeType)) infoScreenPaytables.set(prizeType, new Map());
          infoScreenPaytables.get(prizeType)!.set(figId, [...mathFigCoeff]);
        }
      }
    }
    this.RuntimeGet(IInfoView).SetPaytables(infoScreenPaytables, infoScreenScatterFigures, infoScreenFigureNames, infoScreenGameMultipliers);
    const holdAndSpinRoundInfoView = this.RuntimeTryGet(IHoldAndSpinRoundInfoView);
    if (holdAndSpinRoundInfoView) {
      const hsCurrencyTransform: Map<ECurrencyPrize, HoldAndSpinECurrencyPrize> = new Map([
        [ECurrencyPrize.Undefined, HoldAndSpinECurrencyPrize.Undefined],
        [ECurrencyPrize.Credits, HoldAndSpinECurrencyPrize.Credits],
        [ECurrencyPrize.ExtraSpinsEnergy, HoldAndSpinECurrencyPrize.ExtraSpinsEnergy],
        [ECurrencyPrize.FreeSpinsEnergy, HoldAndSpinECurrencyPrize.FreeSpinsEnergy],
        [ECurrencyPrize.CoinsSpinEnergy, HoldAndSpinECurrencyPrize.CoinsSpinEnergy],
        [ECurrencyPrize.CoinsFreeSpinEnergy, HoldAndSpinECurrencyPrize.CoinsFreeSpinEnergy],
      ]);

      const hsInfoScreenPaytables: Map<HoldAndSpinECurrencyPrize, HoldAndSpinPaytableCoefficients> = new Map();
      for (const [currency, paytable] of infoScreenPaytables) {
        const hsCurrency = hsCurrencyTransform.get(currency)!;
        hsInfoScreenPaytables.set(hsCurrency, infoScreenPaytables.get(currency)!);
      }

      holdAndSpinRoundInfoView.SetPaytables(hsInfoScreenPaytables, infoScreenScatterFigures, infoScreenFigureNames, infoScreenGameMultipliers);
    }
  }

  private SetupWinCombination(roundResult: RoundResult, options: SetupViewsOptions) {
    if (this.IsWheelRoundView(roundResult.GetRoundType(), options)) return;

    const setupSpinReelsCombinations = () => {
      const combinations = this.TryGetSpinReelsCombinations(roundResult, options);
      if (!combinations) return false;
      if (!combinations.length) return false;

      const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundResult.GetRoundType());
      const va = rules.GetVisualAnalyze();

      const stackedFigures = va.GetGroupStackedSymbols(combinations);

      // show slow combinations
      this.RuntimeGet(IWinFiguresView).SetStackedFigures(stackedFigures);
      this.RuntimeGet(IWinFiguresView).ShowCombinations(combinations, !!options.playAnimationFromLoop);

      const autoPlayEnabled = this.ConstParent(IGameManager).IsAutoPlayOn();
      this.RuntimeGet(ILinesView).ShowCombinations(combinations, !!options.showFastLine, autoPlayEnabled);
      this.RuntimeGet(ILinesView).SetVisible(true);

      // hide symbols from underneath
      this.RuntimeGet(IReelsView).ShowCombinations(combinations);

      return true;
    };

    if (!setupSpinReelsCombinations()) {
      this.RuntimeGet(IWinFiguresView).ClearFigures();
      this.RuntimeGet(ILinesView).ClearLines();
      this.RuntimeGet(IReelsView).ClearCombinations();
    }

    if (options.pauseWinAnimations) {
      this.RuntimeGet(IWinFiguresView).PauseAnimations();
      this.RuntimeGet(ILinesView).PauseAnimations();
    } else {
      this.RuntimeGet(IWinFiguresView).ResumeAnimations();
      this.RuntimeGet(ILinesView).ResumeAnimations();
    }

    const hsInfoView = this.RuntimeTryGet(IHoldAndSpinRoundInfoView);
    if (hsInfoView) {
      const setupHoldAndSpinsCombinations = () => {
        // phases
        const phases = roundResult.GetPhases(this.GetRuntime());
        if (!phases.length) return;

        const phase = phases[phases.length - 1];
        let collectedCount = -1;
        if (phase instanceof HoldAndSpinPhase) {
          const winFiguresInfo = phase.winFiguresInfo;
          collectedCount = winFiguresInfo.length;
          hsInfoView.SetCollectedShields(collectedCount);
        } else if (phase instanceof SpinReelsPhase) {
          const combinations = phase.combinations;
          for (const combo of combinations) {
            if (combo.type === CombinationType.HoldAndSpinTrigger) {
              collectedCount = combo.symbolCount;
            }
          }
          hsInfoView.SetCollectedShields(collectedCount);
        }
      };
      setupHoldAndSpinsCombinations();
    }
  }

  private SetupOverlayView() {
    const freeRoundRetriggerView = this.RuntimeTryGet(IFreeRoundRetriggerView);
    if (freeRoundRetriggerView) {
      freeRoundRetriggerView.Clear();
    }
    const freeRoundOverlayView = this.RuntimeTryGet(IFreeRoundOverlayView);
    if (freeRoundOverlayView) {
      freeRoundOverlayView.Clear();
    }
    const extraRoundOverlayView = this.RuntimeTryGet(IExtraRoundOverlayView);
    if (extraRoundOverlayView) {
      extraRoundOverlayView.Clear();
    }
    const gambleRoundOverlayView = this.RuntimeTryGet(IGambleRoundOverlayView);
    if (gambleRoundOverlayView) {
      gambleRoundOverlayView.Clear();
    }
    const tetraRoundOverlayView = this.RuntimeTryGet(ITetraRoundOverlayView);
    if (tetraRoundOverlayView) {
      tetraRoundOverlayView.Clear();
    }
    const tetraRoundView = this.RuntimeTryGet(ITetraRoundView);
    if (tetraRoundView) {
      tetraRoundView.Clear();
    }
    this.RuntimeGet(IBigWinView).Clear();
    const bigWinUnfoldedView = this.RuntimeTryGet(IBigWinInfoView);
    if (bigWinUnfoldedView) {
      bigWinUnfoldedView.Clear();
    }
  }

  private SetupLeftStatusLine(options: SetupViewsOptions) {
    if (options.resetLeftStatusLine) {
      const statusLineView = this.RuntimeGet(IStatusLineView);
      statusLineView.ShowLeftStatus(ELeftStatusLine.None);
    } else if (options.showGambleCompletedStatus) {
      const statusLineView = this.RuntimeGet(IStatusLineView);
      statusLineView.ShowLeftStatus(ELeftStatusLine.GambleCompleted);
    }
  }

  private SetupMidStatusLine(roundResult: RoundResult, options: SetupViewsOptions) {
    const setupSpinReelsCombinations = () => {
      const combinations = this.TryGetSpinReelsCombinations(roundResult, options);
      if (!combinations) return false;
      if (!combinations.length) return false;

      // show slow combinations
      this.RuntimeGet(IStatusLineView).ShowCombinations(combinations, false);

      return true;
    };

    // If we have win comb we show it otherwise we show normal status line
    if (setupSpinReelsCombinations()) {
      if (options.pauseWinAnimations) {
        this.RuntimeGet(IStatusLineView).PauseAnimations();
      } else {
        this.RuntimeGet(IStatusLineView).ResumeAnimations();
      }

      return;
    }

    const roundType = roundResult.GetRoundType();
    const betManager = this.Parent(IBetManager);
    const minBet = betManager.GetMinBet();
    const currentBet = betManager.GetCurrentBet();
    const canChangeBet = betManager.GetBetsWithinLimits().length > 1;
    const available = this.GetAvailableCredits(roundType);

    const isAutoPlayOn = this.Parent(IGameManager).IsAutoPlayOn();

    let status = EStatusLine.None;
    if (!options.enableButtons) {
      status = options.statusLine ?? EStatusLine.None;
    } else if (options.startReeling) {
      status = EStatusLine.GoodLuck;
    } else if (available === 0) {
      status = EStatusLine.InsertCredit_NoCredit;
    } else if (available < minBet && roundType !== RoundType.Extra && roundType !== RoundType.Coins) {
      status = EStatusLine.InsertCredit_LessThenBet;
    } else if (isAutoPlayOn) {
      status = EStatusLine.None;
    } else if (available >= currentBet && canChangeBet) {
      status = EStatusLine.PressStart_SelectBet;
    } else if (available >= currentBet && !canChangeBet) {
      status = EStatusLine.PressStart;
    } else {
      status = EStatusLine.SelectBet;
    }

    const statusLineView = this.RuntimeGet(IStatusLineView);
    statusLineView.ShowStatus(status);
  }

  private SetupRightStatusLine(roundType: RoundType, options: SetupViewsOptions) {
    const gameflow = this.RuntimeTryGetConst(IGameflow);
    if (!gameflow) return;

    const isMatchTakeWin = IsInMatchTakeWin(roundType, options);
    const rightStatus = gameflow.IsIdle()
      ? ERightStatusLine.GameOver
      : (isMatchTakeWin ? ERightStatusLine.RiskOrCashOut : ERightStatusLine.None);

    const statusLineView = this.RuntimeGet(IStatusLineView);
    statusLineView.ShowRightStatus(rightStatus);
  }

  SetupSpecialRoundView(roundResult: RoundResult, options: SetupViewsOptions) {
    if (!this.IsWheelRoundView(roundResult.GetRoundType(), options)) {
      this.HideWheelRoundView();
    }

    this.SetupFreeRoundView(roundResult.GetRoundType(), options);
    this.SetupHoldAndSpinRoundView(roundResult.GetRoundType(), options);
  }

  private SetupFreeRoundView(roundType: RoundType, options: SetupViewsOptions) {
    const gameflow = this.RuntimeGetConst(IGameflow);

    const betManager = this.Parent(IBetManager);
    const currentBet = betManager.GetCurrentBet();

    const roundToCurrencyAndView: Map<RoundType, FreeSpinViewAndCurrency> = new Map([
      [RoundType.Free, { currency: Currency.FreeSpinEnergy, getter: () => this.RuntimeTryGet(IFreeSpinBarView) }],
      [RoundType.CoinsFree, { currency: Currency.CoinsFreeSpinEnergy, getter: () => this.RuntimeTryGet(ICoinsFreeSpinBarView) }],
      [RoundType.ExtraFree, { currency: Currency.ExtraFreeSpinEnergy, getter: () => this.RuntimeTryGet(IExtraFreeSpinBarView) }],
    ]);

    const calculateSpins = (currency: CurrencyType): [int64_t, int64_t] => {
      const currentSpin = Math.trunc(gameflow.GetConsecutiveRoundConsumed(currency) / currentBet);
      const targetSpin = Math.trunc(gameflow.GetConsecutiveRoundAvailable(currency) / currentBet);

      return [currentSpin, targetSpin];
    };

    const freeSpinRoundType = options.overrideSpecialRoundView ?? roundType;
    if (!roundToCurrencyAndView.has(freeSpinRoundType)) return this.HideFreeSpinViews();
    const freeSpinView = roundToCurrencyAndView.get(freeSpinRoundType)!;

    const freeSpinViewObject = freeSpinView.getter();
    if (!freeSpinViewObject) return;

    const [currentSpin, targetSpin] = calculateSpins(freeSpinView.currency);

    freeSpinViewObject.SetCurrentCounter(currentSpin);
    freeSpinViewObject.SetTotalCounterTarget(targetSpin);
    freeSpinViewObject.SetVisible(true);
  }

  private IsWheelRoundView(roundType: RoundType, options: SetupViewsOptions) {
    return (options.overrideSpecialRoundView ?? roundType) === RoundType.Wheel;
  }

  private HideWheelRoundView() {
    const wheelView = this.RuntimeTryGet(IWheelRoundOverlayView);
    if (wheelView) {
      wheelView.Clear();
    }

    const wheelRoundView = this.RuntimeTryGet(IWheelRoundView);
    if (wheelRoundView) {
      wheelRoundView.Clear();

      this.RuntimeGet(IWheelCancelSwButtonView).SetVisible(false);
      this.RuntimeGet(IWheelStartSwButtonView).SetVisible(false);
    }

    const cancelButtonView = this.RuntimeTryGet(IWheelCancelSwButtonView);
    if (cancelButtonView) {
      cancelButtonView.SetVisible(false);
      cancelButtonView.SetEnabled(false);
    }

    const wheelStartButton = this.RuntimeTryGet(IWheelStartSwButtonView);
    if (wheelStartButton) {
      wheelStartButton.SetEnabled(false);
      wheelStartButton.SetVisible(false);
    }
  }

  private SetupHoldAndSpinRoundView(roundType: RoundType, options: SetupViewsOptions) {
    const isHoldAndSpin = (options.overrideSpecialRoundView ?? roundType) === RoundType.HoldAndSpin;

    const holdAndSpinView = this.RuntimeTryGet(IHoldAndSpinRoundOverlayView);
    if (holdAndSpinView) {
      if (isHoldAndSpin) {
        holdAndSpinView.SetHoldAndSpinBannerVisible(true);
      } else {
        holdAndSpinView.SetHoldAndSpinBannerVisible(false);
        holdAndSpinView.Clear();
      }
    }
  }

  private HideFreeSpinViews() {
    {
      const freeSpinView = this.RuntimeTryGet(IFreeSpinBarView);
      if (freeSpinView) {
        freeSpinView.SetVisible(false);
      }
    }

    {
      const freeSpinView = this.RuntimeTryGet(ICoinsFreeSpinBarView);
      if (freeSpinView) {
        freeSpinView.SetVisible(false);
      }
    }

    {
      const freeSpinView = this.RuntimeTryGet(IExtraFreeSpinBarView);
      if (freeSpinView) {
        freeSpinView.SetVisible(false);
      }
    }
  }

  private SetupButtons(roundType: RoundType, options: SetupViewsOptions) {
    this.SetupSwButtons(roundType, options);
    this.SetupHwButtons(roundType, options);
    this.SetupBetButtons();
    this.SetupLineButtons();
  }

  private SetupHwButtons(roundType: RoundType, options: SetupViewsOptions) {
    const credits = this.RuntimeGetConst(IWallet).GetCredit();
    const gameflow = this.RuntimeGetConst(IGameflow);
    const isInIdle = gameflow.IsIdle();
    const isInGamble = IsInGamble(roundType, options);
    const isInMatchTakeWin = IsInMatchTakeWin(roundType, options);
    const available = this.GetAvailableCredits(roundType);
    const hasLeftOver = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType).HasLeftOver();

    const betManager = this.Parent(IBetManager);
    const currentBet = betManager.GetCurrentBet();
    const maxBet = betManager.GetMaxBet();
    const minBet = betManager.GetMinBet();
    const nextBet = betManager.GetNextBet();

    const isAutoPlayOn = this.ConstParent(IGameManager).IsAutoPlayOn();
    const canChangeBet = this.CanChangeBet(nextBet, currentBet, minBet, isInIdle, credits) && !isAutoPlayOn;
    const canMaxBet = this.CanMaxBet(maxBet, currentBet, minBet, isInIdle, credits) && !isAutoPlayOn;
    const canStartMatch = (currentBet <= available || hasLeftOver) && this.IsLanguageMenuClosed();
    const canCashout = credits > 0 && !isAutoPlayOn;
    const canCollect = this.IsTakeCoinsButtonAvailable(roundType, options);
    const canAutoPlay = canStartMatch || isAutoPlayOn;
    const hwInfoButtonEnabled = !isAutoPlayOn && !options.disableInfoButton;
    const canExit = !isAutoPlayOn && (isInIdle || isInGamble || isInMatchTakeWin);

    this.RuntimeGet(IStartHwButton).SetButtonState({
      enabled: canStartMatch,
      light: roundType === RoundType.Coins ? HwButtonLight.BlinkSlowA : HwButtonLight.On,
    });
    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: canChangeBet, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: canChangeBet, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: canMaxBet, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: canCashout, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: canCollect, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: canAutoPlay, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: hwInfoButtonEnabled });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: canExit });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleRedHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleBlackHwButton).SetButtonState({ enabled: false });
  }

  private CanMaxBet(maxBet: int64_t, currentBet: int64_t, minBet: int64_t, isInIdle: boolean, credits: int64_t) {
    // can max bet when maxBet is valid & maxbet != currentBet
    // exception when in-idle & credits is > minBet -> FALSE
    return maxBet > 0 && maxBet !== currentBet && (!isInIdle || (isInIdle && credits > minBet));
  }

  private CanChangeBet(nextBet: int64_t, currentBet: int64_t, minBet: int64_t, isInIdle: boolean, credits: int64_t) {
    // can change bet when nextBet is valid & nextBet != currentBet
    // exception when in-idle & credits is 0
    return (nextBet > 0 && nextBet !== currentBet && minBet <= credits) || (isInIdle && credits === 0);
  }

  private SetupSwButtons(roundType: RoundType, options: SetupViewsOptions) {
    const canExit = roundType !== RoundType.Coins;
    const canChangeLanguages = this.IsLanguageMenuOpened() || (this.IsLanguageMenuClosed() && this.IsBetMenuClosed());
    const canChangeResponsibleGaming = roundType !== RoundType.Coins && roundType !== RoundType.Wheel;
    const responsibleSwEnabled = canChangeResponsibleGaming && this.IsResponsibleGamingAvailable();

    // enable
    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(canExit);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(!options.disableInfoButton);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(true);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(canChangeLanguages);
    this.RuntimeGet(IResponsibleSwButtonView).SetEnabled(responsibleSwEnabled);

    const exitTetraSwButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    if (exitTetraSwButton) {
      exitTetraSwButton.SetEnabled(false);
      exitTetraSwButton.SetVisible(false);
    }

    const takeCoinsSWButton = this.RuntimeTryGet(ITakeCoinsSwButtonView);
    if (takeCoinsSWButton) {
      takeCoinsSWButton.EnableButtonSkin(this.IsTakeCoinsButtonAvailable(roundType, options));
    }
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(!!options.startReeling);

    const redBtn = this.RuntimeTryGet(IGambleRedSwButtonView);
    if (redBtn) {
      redBtn.SetEnabled(false);
    }

    const blackBtn = this.RuntimeTryGet(IGambleBlackSwButtonView);
    if (blackBtn) {
      blackBtn.SetEnabled(false);
    }

    this.SetupVisibleButtons(roundType, options);
  }

  private SetupVisibleButtons(roundType: RoundType, options: SetupViewsOptions) {
    const isMatchTakeWin = IsInMatchTakeWin(roundType, options);
    const canWheel = roundType === RoundType.Coins && !isMatchTakeWin;
    const canExit = !canWheel;

    // visible
    const takeCoinsSWButton = this.RuntimeTryGet(ITakeCoinsSwButtonView);
    if (takeCoinsSWButton) {
      takeCoinsSWButton.SetVisible(canWheel);
    }

    this.RuntimeGet(IExitGameSwButtonView).SetVisible(canExit);
    this.RuntimeGet(IBetUpSwButtonView).SetVisible(true);
    this.RuntimeGet(IBetDownSwButtonView).SetVisible(true);
    this.RuntimeGet(ILineUpSwButtonView).SetVisible(true);
    this.RuntimeGet(ILineDownSwButtonView).SetVisible(true);
    const redBtn = this.RuntimeTryGet(IGambleRedSwButtonView);
    if (redBtn) {
      redBtn.SetVisible(false);
    }

    const blackBtn = this.RuntimeTryGet(IGambleBlackSwButtonView);
    if (blackBtn) {
      blackBtn.SetVisible(false);
    }
  }

  private SetupBetButtons() {
    const canOpenBets = this.IsBetMenuOpened() || (this.IsLanguageMenuClosed() && this.IsBetMenuClosed());
    this.RuntimeGet(IBetUpSwButtonView).SetButtonState(canOpenBets, false, 'Bet Up', false);
    this.RuntimeGet(IBetDownSwButtonView).SetButtonState(canOpenBets, false, 'Bet Down', false);
  }

  private SetupLineButtons() {
    const betManager = this.Parent(IBetManager);
    const currentLine = betManager.GetCurrentLines();
    const minLine = betManager.GetMinLines();
    const maxLine = betManager.GetMaxLines();

    const canChangeLineUp = currentLine < maxLine;
    const canChangeLineDown = currentLine > minLine;

    this.RuntimeGet(ILineUpSwButtonView).SetButtonState(canChangeLineUp, false, 'Line Up', canChangeLineUp);
    this.RuntimeGet(ILineDownSwButtonView).SetButtonState(canChangeLineDown, false, 'Line Down', canChangeLineDown);
  }

  private DisableButtons(roundType: RoundType, options: SetupViewsOptions) {
    const isAutoPlayOn = this.ConstParent(IGameManager).IsAutoPlayOn();
    const isInMatchTakeWin = IsInMatchTakeWin(roundType, options);

    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(isInMatchTakeWin);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(!options.disableInfoButton);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(true);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(false);
    this.RuntimeGet(IBetUpSwButtonView).SetEnabled(false);
    this.RuntimeGet(IBetDownSwButtonView).SetEnabled(false);
    this.RuntimeGet(ILineUpSwButtonView).SetEnabled(false);
    this.RuntimeGet(ILineDownSwButtonView).SetEnabled(false);
    this.RuntimeGet(IResponsibleSwButtonView).SetEnabled(false);

    const takeCoinsSWButton = this.RuntimeTryGet(ITakeCoinsSwButtonView);
    if (takeCoinsSWButton) {
      takeCoinsSWButton.SetEnabled(false);
    }

    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(!!options.startReeling);

    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: !!options.enableFastForwardCollect && !isAutoPlayOn });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: !!options.enableFastForwardCollect && !isAutoPlayOn });
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: !!options.enableFastForwardCollect && !isAutoPlayOn });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: !!options.enableFastForwardCollect || isAutoPlayOn, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IStartHwButton).SetButtonState({
      enabled: true,
      light: isAutoPlayOn || roundType === RoundType.Coins ? HwButtonLight.BlinkSlowA : HwButtonLight.On,
    });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: !options.disableInfoButton && !isAutoPlayOn });
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleRedHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleBlackHwButton).SetButtonState({ enabled: false });

    this.RuntimeGet(IBetMenuView).SetButtonUpEnabled(false);
    this.RuntimeGet(IBetMenuView).SetButtonDownEnabled(false);

    const redBtn = this.RuntimeTryGet(IGambleRedSwButtonView);
    if (redBtn) {
      redBtn.SetEnabled(false);
    }

    const blackBtn = this.RuntimeTryGet(IGambleBlackSwButtonView);
    if (blackBtn) {
      blackBtn.SetEnabled(false);
    }

    this.SetupVisibleButtons(roundType, options);
  }

  private BlockGameButtons(roundType: RoundType, options: SetupViewsOptions) {
    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(false);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(false);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(false);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(false);
    this.RuntimeGet(IBetUpSwButtonView).SetEnabled(false);
    this.RuntimeGet(IBetDownSwButtonView).SetEnabled(false);
    this.RuntimeGet(ILineUpSwButtonView).SetEnabled(false);
    this.RuntimeGet(ILineDownSwButtonView).SetEnabled(false);
    this.RuntimeGet(IResponsibleSwButtonView).SetEnabled(false);

    const takeCoinsSWButton = this.RuntimeTryGet(ITakeCoinsSwButtonView);
    if (takeCoinsSWButton) {
      takeCoinsSWButton.SetEnabled(false);
    }

    const exitTetraSwButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    if (exitTetraSwButton) {
      exitTetraSwButton.SetEnabled(false);
      exitTetraSwButton.SetVisible(false);
    }

    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(false);

    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleRedHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleBlackHwButton).SetButtonState({ enabled: false });

    this.RuntimeGet(IBetMenuView).SetButtonUpEnabled(false);
    this.RuntimeGet(IBetMenuView).SetButtonDownEnabled(false);

    const redBtn = this.RuntimeTryGet(IGambleRedSwButtonView);
    if (redBtn) {
      redBtn.SetEnabled(false);
    }

    const blackBtn = this.RuntimeTryGet(IGambleBlackSwButtonView);
    if (blackBtn) {
      blackBtn.SetEnabled(false);
    }

    this.SetupVisibleButtons(roundType, options);
  }

  private IsResponsibleGamingAvailable() {
    const responsibleGaming = this.RuntimeTryGetConst(IResponsibleGaming);
    if (responsibleGaming) {
      return responsibleGaming.IsResponsibleGamingSetupEnable();
    }
    return false;
  }

  private IsTakeCoinsButtonAvailable(roundType: RoundType, options: SetupViewsOptions) {
    const isMatchTakeWin = IsInMatchTakeWin(roundType, options);
    if (!(roundType === RoundType.Coins && !isMatchTakeWin)) return false;

    const isAutoPlayOn = this.ConstParent(IGameManager).IsAutoPlayOn();
    if (isAutoPlayOn) return false;

    const gameflow = this.RuntimeGetConst(IGameflow);
    const availableCoins = gameflow.GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy);

    const mathRules = this.RuntimeGetConst(IMathRules);

    const minimumCoinsRequired = mathRules.GetWheelRoundRules(RoundType.Wheel).GetMinimumCoinBet();

    if (minimumCoinsRequired > availableCoins) return false;

    return true;
  }

  private GetAvailableCredits(roundType: RoundType) {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const walletCredits = this.RuntimeGetConst(IWallet).GetCredit();
    if (gameflow.IsIdle()) return walletCredits;
    if (roundType === RoundType.Extra) return gameflow.GetMatchCurrencyAvailable(Currency.ExtraSpinEnergy);
    if (roundType === RoundType.Coins) return gameflow.GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy);
    if (roundType === RoundType.Tetra) return gameflow.GetMatchCurrencyAvailable(Currency.Credits);

    return walletCredits;
  }

  private IsLanguageMenuOpened() {
    const systemStatics = this.ConstStatic(ViewManagerStatics);
    return systemStatics.languageMenuVisible && !systemStatics.languageMenuMoving;
  }

  private IsLanguageMenuClosed() {
    const systemStatics = this.ConstStatic(ViewManagerStatics);
    return !systemStatics.languageMenuVisible && !systemStatics.languageMenuMoving;
  }

  private IsBetMenuOpened() {
    const systemStatics = this.ConstStatic(ViewManagerStatics);
    return systemStatics.betMenuVisible && !systemStatics.betMenuMoving;
  }

  private IsBetMenuClosed() {
    const systemStatics = this.ConstStatic(ViewManagerStatics);
    return !systemStatics.betMenuVisible && !systemStatics.betMenuMoving;
  }

  private TryGetSpinReelsCombinations(roundResult: RoundResult, options: SetupViewsOptions): ConstPointer<ReelCombinations> {
    if (options.showInitialStop) return null;
    if (!options.showSpinReelsCombinations) return null;
    if (this.ConstParent(IBetManager).GetInitialBetModified()) return null;

    const phases = roundResult.GetPhases(this.GetRuntime());
    if (!phases.length) return null;

    const phase = phases[phases.length - 1];
    return phase instanceof SpinReelsPhase ? phase.combinations : null;
  }
}

EgtALogCategoryClass(ViewManager, 'ViewManager');
