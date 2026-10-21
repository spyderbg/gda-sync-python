// Egt::Game::AlphaFamily::ViewManager (AlphaFamilyStatesLibrary/ViewManager.h/.cpp): sets up every view for a round
// type or a round result, as a state asks with its SetupViewsOptions.

import { Event } from '@game/engine/Core/Event';
import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import {
  HwButtonLight, IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IDecreaseBetHwButton, IExitHwButton, IGambleBlackHwButton, IGambleHwButton,
  IGambleRedHwButton, IIncreaseBetHwButton, IInfoHwButton, IMaxBetHwButton, IStartHwButton,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IResponsibleGaming } from '@game/engine/Game/RuntimeImport/IResponsibleGaming';
import { IWallet } from '@game/engine/Game/RuntimeImport/IWallet';
import { Currency, ELeftStatusLine, ERightStatusLine, EStatusLine, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { type ReelCombinations, SpinReelsPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundPhase.data';
import { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { GameManagerNvrams, IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager, type IViewManagerEvents, type SetupViewsOptions, ViewManagerStatics } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { EWinBarState, IBetBarView, ICreditBarView, ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBetMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { ECurrencyPrize, type FigureId, IInfoView, type PaytableCoefficients } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import type { uint32_t } from '@game/engine/GameCore/Common/Types';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ILanguageMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IBigWinView, IKnobsView, ITetraRoundOverlayView, ITopperView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { ITetraRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import {
  IBetDownSwButtonView, IBetUpSwButtonView, IExitGameSwButtonView, IExitTetraSwButtonView, IInfoSwButtonView, ILanguageSwButtonView, ILineDownSwButtonView,
  ILineUpSwButtonView, IResponsibleSwButtonView, ISoundVolumeSwButtonView, IStopSingleReelSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

function IsInMatchTakeWin(roundType: RoundType, options: SetupViewsOptions) {
  return (options.overrideSpecialRoundView ?? roundType) === RoundType.Gamble;
}

function IsInGamble(roundType: RoundType) {
  return roundType === RoundType.Gamble;
}

function IsInTetra(roundType: RoundType, options: SetupViewsOptions) {
  return (options.overrideSpecialRoundView ?? roundType) === RoundType.Tetra;
}

/** The options' defaults, as SetupViewsOptions initializes its members. */
function WithDefaults(options: SetupViewsOptions): SetupViewsOptions {
  return { showSpinReelsCombinations: true, setupOverlay: true, setupReels: true, changeCreditBar: true, statusLine: EStatusLine.None, ...options };
}

export class ViewManager extends State implements IViewManager, IViewManagerEvents {
  static Interfaces = [IViewManager, IViewManager.Events];
  static Statics = [ViewManagerStatics];

  readonly betMenuStateChanged = new Event();
  readonly languageMenuStateChanged = new Event();

  OnTransit() {
    this.AttachCallbacks();
  }

  SetupViews(roundResultOrType: RoundResult | RoundType, options: SetupViewsOptions) {
    if (roundResultOrType instanceof RoundResult) {
      this.SetupViewsFor(roundResultOrType.GetTriggerRoundType(), roundResultOrType, WithDefaults(options));
      return;
    }
    const roundType = roundResultOrType;
    const nvrams = this.ConstNvram(GameManagerNvrams);
    const mathRules = this.RuntimeGet(IMathRules);
    let correspondingReelRoundType: RoundType;
    switch (roundType) {
      case RoundType.Undefined: correspondingReelRoundType = RoundType.Main; break;
      case RoundType.Gamble: {
        // For a Gamble round, determine the corresponding reel round type based on the last result of the Main slot.
        const slot = mathRules.GetReelRoundRules(RoundType.Main).GetLastResultSlot();
        if (!nvrams.lastRoundResults[slot]) return;
        correspondingReelRoundType = nvrams.lastRoundResults[slot].GetRoundType();
        break;
      }
      case RoundType.Wheel: correspondingReelRoundType = RoundType.Coins; break;
      case RoundType.Tetra: correspondingReelRoundType = RoundType.Main; break;
      default: correspondingReelRoundType = roundType; break;
    }
    const slot = mathRules.GetReelRoundRules(correspondingReelRoundType).GetLastResultSlot();
    const result = nvrams.lastRoundResults[slot];
    if (!result) return;
    this.SetupViewsFor(correspondingReelRoundType, result, WithDefaults(options));
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
    if (this.RuntimeTryGet(ICreditBarView)) {
      this.ReactOn(this.RuntimeGetConst(ICreditBarView.Events).animatingDone, this.OnWinAccumulationAnimEnd);
      this.ReactOn(this.RuntimeGetConst(ICreditBarView.Events).animatingInstantDone, this.OnWinAccumulationAnimInstantEnd);
    }
  }

  private get statics() {
    return this.Static(ViewManagerStatics);
  }

  OnLanguageSwButtonPressed() {
    if (this.statics.languageMenuVisible) this.RuntimeGet(ILanguageMenuView).CloseMenu();
    else this.RuntimeGet(ILanguageMenuView).OpenMenu();
    return this.Consume();
  }

  OnBetButtonPressed() {
    if (this.statics.betMenuVisible) this.RuntimeGet(IBetMenuView).CloseMenu();
    else this.RuntimeGet(IBetMenuView).OpenMenu();
    return this.Consume();
  }

  OnLanguageMenuOpened() {
    Object.assign(this.statics, { languageMenuVisible: true, languageMenuMoving: false });
    this.languageMenuStateChanged.Post();
    return this.Consume();
  }

  OnLanguageMenuClosed() {
    Object.assign(this.statics, { languageMenuVisible: false, languageMenuMoving: false });
    this.languageMenuStateChanged.Post();
    this.RuntimeGet(ILanguageSwButtonView).ResetButtonState();
    return this.Consume();
  }

  OnLanguageMenuMoving() {
    this.statics.languageMenuMoving = true;
    this.languageMenuStateChanged.Post();
    return this.Consume();
  }

  OnBetMenuOpened() {
    Object.assign(this.statics, { betMenuVisible: true, betMenuMoving: false });
    this.betMenuStateChanged.Post();
    return this.Consume();
  }

  OnBetMenuClosed() {
    Object.assign(this.statics, { betMenuVisible: false, betMenuMoving: false });
    this.betMenuStateChanged.Post();
    this.RuntimeGet(IBetUpSwButtonView).ResetButtonState();
    this.RuntimeGet(IBetDownSwButtonView).ResetButtonState();
    return this.Consume();
  }

  OnBetMenuMoving() {
    this.statics.betMenuMoving = true;
    this.betMenuStateChanged.Post();
    return this.Consume();
  }

  OnWinAccumulationAnimEnd(_value: number) {
    this.RuntimeGet(ILinesView).StopWinLinesSounds('AccumulationEnd');
    return this.Forward();
  }

  OnWinAccumulationAnimInstantEnd(_value: number) {
    this.RuntimeGet(ILinesView).StopWinLinesSounds('AccumulationInstantEnd');
    return this.Forward();
  }

  private SetupViewsFor(roundType: RoundType, result: RoundResult, options: SetupViewsOptions) {
    this.SetupBets(roundType, options);
    if (options.blockGameInput) this.BlockGameButtons(roundType, options);
    else if (options.enableButtons) this.SetupButtons(roundType, options);
    else this.DisableButtons(roundType, options);
    this.SetupCurrencyValues(roundType, options);
    this.SetupBetMenuView(roundType, options);
    this.SetupKnobsView();
    this.SetupStatusLineView(result, options);
    this.SetupInfoView(roundType, options);
    this.SetupTopperView();
    this.SetupWinCombination(result, options);
    this.SetupSpecialRoundView(result, options);
    if (options.setupOverlay) this.SetupOverlayView();
    if (options.setupReels) this.SetupReelsView(roundType, result, options);
  }

  private SetupBets(roundType: RoundType, options: SetupViewsOptions) {
    if (IsInTetra(roundType, options)) return; // handled in TetraRound
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    const limits = this.RuntimeGetConst(ILimits).GetBetLimits();
    const gameflow = this.RuntimeGetConst(IGameflow);
    const available = this.GetAvailableCredits(roundType);
    const maxBetMultiplier = rules.GetMaxBetMultiplier();
    const maxBet = maxBetMultiplier > 0 ? Math.min(gameflow.GetInitialCreditsBet() * maxBetMultiplier, limits.maxBet) : limits.maxBet;
    const minBetMultiplier = rules.GetMinBetMultiplier();
    const minBet = minBetMultiplier > 0 ? Math.max(gameflow.GetInitialCreditsBet() * minBetMultiplier, limits.minBet) : limits.minBet;
    let bets = rules.GetAllowedBets(minBet, maxBet);
    if (!bets.length) bets = [rules.GetMinBet()];
    const betManager = this.Parent(IBetManager);
    betManager.SetEditMode(!!options.enableButtons);
    betManager.SetAllowedBets(bets);
    betManager.SetAllowedLines(rules.GetAllowedLines());
    betManager.SetBetLimit(gameflow.IsIdle() && available === 0 ? limits.maxBet : available);
    betManager.SetBetCurrency(rules.GetBetBarCurrencyType());
  }

  private SetupReelsView(roundType: RoundType, roundResult: RoundResult, options: SetupViewsOptions) {
    if (options.overrideSpecialRoundView === RoundType.Tetra || options.overrideFakeReels === RoundType.Tetra) return;
    if (roundResult.GetRoundType() === RoundType.Tetra || roundType === RoundType.Tetra) return;
    const phases = roundResult.GetPhases();
    const phase = phases[0];
    if (!(phase instanceof SpinReelsPhase)) return;
    const mathRules = this.RuntimeGetConst(IMathRules);
    const fakeReels = mathRules.GetReelRoundRules(options.overrideFakeReels ?? roundResult.GetInput().roundType).GetFakeReels();
    const reelsView = this.RuntimeGet(IReelsView);
    reelsView.SetupFakeReels(fakeReels);
    reelsView.SetStopFigures(options.showInitialStop ? phase.initialStop : phase.stop);
    reelsView.SetSymbolsAroundStop(phase.beforeStop, phase.afterStop);
    reelsView.ClearHoldAndSpinSymbols();
    if (options.startReeling) reelsView.StartReeling();
    else reelsView.ShowStopFigures();
    if (options.stopFirstReel) reelsView.StartNormalReelingStop(0);
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
      winBar.SetValueNow(gameflow.GetMatchCurrencyRewarded(Currency.Credits) - gameflow.GetMatchCurrencyConsumed(Currency.Credits));
      winBar.SetLabelState(EWinBarState.Win);
    }
    // credits
    const creditView = this.RuntimeTryGet(ICreditBarView);
    if (creditView && options.changeCreditBar) creditView.SetValueNow(credits);
    const coins = options.overrideCoinsBar ?? available.Get(Currency.CoinsSpinEnergy);
    const isBettingCoins = this.Parent(IBetManager).GetBetCurrency() === Currency.CoinsSpinEnergy;
    if ((isBettingCoins || coins > 0) && !IsInMatchTakeWin(roundType, options)) creditView?.Minimize(false);
    else creditView?.Maximize(false);
  }

  private SetupBetMenuView(roundType: RoundType, options: SetupViewsOptions) {
    if (IsInTetra(roundType, options)) return; // handled in TetraRound
    const betManager = this.Parent(IBetManager);
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    const menu = this.RuntimeGet(IBetMenuView);
    const currentBet = betManager.GetCurrentBet();
    const allowedBets = betManager.GetAllowedBetsIncludingSelected();
    const minAllowedBet = allowedBets[0];
    const maxAllowedBet = allowedBets[allowedBets.length - 1];
    menu.SetPossibleTotalBets(allowedBets);
    menu.SetPossibleLines(rules.GetAllowedLines());
    menu.SetSelectedTotalBet(currentBet);
    menu.SetBetLimit(betManager.GetBetLimit());
    menu.SetSelectedLines(betManager.GetCurrentLines());
    menu.SetCurrency(betManager.GetBetCurrency());
    if (options.startReeling) menu.CloseMenu();
    const previewAllBets = this.RuntimeGetConst(IGameflow).IsIdle() && this.RuntimeGetConst(IWallet).GetCredit() === 0;
    menu.SetButtonUpEnabled(currentBet < betManager.GetMaxBet() || (previewAllBets && currentBet < maxAllowedBet));
    menu.SetButtonDownEnabled(currentBet > betManager.GetMinBet() || (previewAllBets && currentBet > minAllowedBet));
    const bar = this.RuntimeGet(IBetBarView);
    bar.SetValueNow(betManager.GetCurrentBet());
    bar.SetCurrency(betManager.GetBetCurrency());
    bar.SetSkin('');
  }

  private SetupKnobsView() {
    this.RuntimeGet(IKnobsView).SetVisible(true);
  }

  private SetupStatusLineView(roundResult: RoundResult, options: SetupViewsOptions) {
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
    const capping = this.RuntimeGet(ILimits).GetWinCapping().capping;
    const infoScreen = this.RuntimeGet(IInfoView);
    infoScreen.SetWinCappingLimit(capping);
    infoScreen.SetStakes(currentBet, currentLines);
    // SetupInfoViewPaytables needs to be called after we set the stakes
    this.SetupInfoViewPaytables(roundType);
    infoScreen.SetGambleCapLimit(capping / 2);
    infoScreen.SetGambleLimits(capping, 0);
    if (options.autoSelectInfoPage) infoScreen.ShowRoundInfo(options.overrideSpecialRoundView ?? roundType, true);
    infoScreen.HideWins();
  }

  private SetupTopperView() {
    this.RuntimeTryGet(ITopperView)?.RefreshAnimations();
  }

  private SetupInfoViewPaytables(roundType: RoundType) {
    const infoScreenPaytables = new Map<ECurrencyPrize, PaytableCoefficients>();
    const currencyTransform: Map<CurrencyType, ECurrencyPrize> = new Map([
      [Currency.Undefined, ECurrencyPrize.Undefined], [Currency.Credits, ECurrencyPrize.Credits], [Currency.ExtraSpinEnergy, ECurrencyPrize.ExtraSpinsEnergy],
      [Currency.FreeSpinEnergy, ECurrencyPrize.FreeSpinsEnergy], [Currency.CoinsSpinEnergy, ECurrencyPrize.CoinsSpinEnergy],
      [Currency.CoinsFreeSpinEnergy, ECurrencyPrize.CoinsFreeSpinEnergy],
    ]);
    const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    for (const mathPayTable of rules.GetConfig().lineConfig.linePayTables) {
      const prizeType = currencyTransform.get(mathPayTable.currencyType) ?? ECurrencyPrize.Undefined;
      const coefficients: PaytableCoefficients = new Map();
      for (let mathFigId = 0; mathFigId < mathPayTable.symbolCountPayout.length; mathFigId++) {
        coefficients.set(mathFigId, mathPayTable.symbolCountPayout[mathFigId]); // copy
      }
      infoScreenPaytables.set(prizeType, coefficients);
    }
    for (const mathPayTable of rules.GetConfig().scatterConfig.scatterPayTables) {
      const prizeType = currencyTransform.get(mathPayTable.currencyType) ?? ECurrencyPrize.Undefined;
      if (!infoScreenPaytables.has(prizeType)) infoScreenPaytables.set(prizeType, new Map());
      for (const [figId, mathFigCoeff] of mathPayTable.symbolCountPayout) infoScreenPaytables.get(prizeType)!.set(figId, mathFigCoeff);
    }
    const infoScreenScatterFigures: Set<FigureId> = new Set();
    for (const mathScatter of rules.GetConfig().scatterConfig.scatterSymbols) infoScreenScatterFigures.add(mathScatter.symbolId);
    const infoScreenFigureNames: Map<FigureId, string> = new Map();
    for (const mathSymbol of rules.GetConfig().spinConfig.symbols) infoScreenFigureNames.set(mathSymbol.id, mathSymbol.name.toLowerCase());
    const infoScreenGameMultipliers: uint32_t[] = [1];
    for (const wild of rules.GetConfig().lineConfig.wildSymbols) {
      for (const multiplier of wild.multipliers.data) infoScreenGameMultipliers.push(multiplier.factor);
    }
    this.RuntimeGet(IInfoView).SetPaytables(infoScreenPaytables, infoScreenScatterFigures, infoScreenFigureNames, infoScreenGameMultipliers);
  }

  private SetupWinCombination(roundResult: RoundResult, options: SetupViewsOptions) {
    const combinations = this.TryGetSpinReelsCombinations(roundResult, options);
    if (combinations && combinations.length) {
      const rules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundResult.GetRoundType());
      const stackedFigures = rules.GetVisualAnalyze().GetGroupStackedSymbols(combinations);
      // show slow combinations
      this.RuntimeGet(IWinFiguresView).SetStackedFigures(stackedFigures);
      this.RuntimeGet(IWinFiguresView).ShowCombinations(combinations, !!options.playAnimationFromLoop);
      this.RuntimeGet(ILinesView).ShowCombinations(combinations, !!options.showFastLine, this.Parent(IGameManager).IsAutoPlayOn());
      this.RuntimeGet(ILinesView).SetVisible(true);
      // hide symbols from underneath
      this.RuntimeGet(IReelsView).ShowCombinations(combinations);
    } else {
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
  }

  SetupSpecialRoundView(_roundResult: RoundResult, _options: SetupViewsOptions) {
    // BurningCrownTetraSpins10 has no free, hold and spin or wheel rounds, whose views this hides or shows in C++.
  }

  private SetupOverlayView() {
    this.RuntimeTryGet(ITetraRoundOverlayView)?.Clear();
    this.RuntimeTryGet(ITetraRoundView)?.Clear();
    this.RuntimeGet(IBigWinView).Clear();
  }

  private SetupLeftStatusLine(options: SetupViewsOptions) {
    if (options.resetLeftStatusLine) this.RuntimeGet(IStatusLineView).ShowLeftStatus(ELeftStatusLine.None);
    else if (options.showGambleCompletedStatus) this.RuntimeGet(IStatusLineView).ShowLeftStatus(ELeftStatusLine.GambleCompleted);
  }

  private SetupMidStatusLine(roundResult: RoundResult, options: SetupViewsOptions) {
    // If we have win comb we show it otherwise we show normal status line
    const combinations = this.TryGetSpinReelsCombinations(roundResult, options);
    if (combinations && combinations.length) {
      this.RuntimeGet(IStatusLineView).ShowCombinations(combinations, false);
      if (options.pauseWinAnimations) this.RuntimeGet(IStatusLineView).PauseAnimations();
      else this.RuntimeGet(IStatusLineView).ResumeAnimations();
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
    if (!options.enableButtons) status = options.statusLine ?? EStatusLine.None;
    else if (options.startReeling) status = EStatusLine.GoodLuck;
    else if (available === 0) status = EStatusLine.InsertCredit_NoCredit;
    else if (available < minBet && roundType !== RoundType.Extra && roundType !== RoundType.Coins) status = EStatusLine.InsertCredit_LessThenBet;
    else if (isAutoPlayOn) status = EStatusLine.None;
    else if (available >= currentBet && canChangeBet) status = EStatusLine.PressStart_SelectBet;
    else if (available >= currentBet && !canChangeBet) status = EStatusLine.PressStart;
    else status = EStatusLine.SelectBet;
    this.RuntimeGet(IStatusLineView).ShowStatus(status);
  }

  private SetupRightStatusLine(roundType: RoundType, options: SetupViewsOptions) {
    const gameflow = this.RuntimeTryGetConst(IGameflow);
    if (!gameflow) return;
    const rightStatus = gameflow.IsIdle() ? ERightStatusLine.GameOver
      : IsInMatchTakeWin(roundType, options) ? ERightStatusLine.RiskOrCashOut : ERightStatusLine.None;
    this.RuntimeGet(IStatusLineView).ShowRightStatus(rightStatus);
  }

  private SetupButtons(roundType: RoundType, options: SetupViewsOptions) {
    this.SetupSwButtons(roundType, options);
    this.SetupHwButtons(roundType, options);
    this.SetupBetButtons();
    this.SetupLineButtons();
  }

  private SetupHwButtons(roundType: RoundType, options: SetupViewsOptions) {
    const credits = this.RuntimeGetConst(IWallet).GetCredit();
    const isInIdle = this.RuntimeGetConst(IGameflow).IsIdle();
    const available = this.GetAvailableCredits(roundType);
    const hasLeftOver = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType).HasLeftOver();
    const betManager = this.Parent(IBetManager);
    const currentBet = betManager.GetCurrentBet();
    const minBet = betManager.GetMinBet();
    const isAutoPlayOn = this.Parent(IGameManager).IsAutoPlayOn();
    const canChangeBet = this.CanChangeBet(betManager.GetNextBet(), currentBet, minBet, isInIdle, credits) && !isAutoPlayOn;
    const canMaxBet = this.CanMaxBet(betManager.GetMaxBet(), currentBet, minBet, isInIdle, credits) && !isAutoPlayOn;
    const canStartMatch = (currentBet <= available || hasLeftOver) && this.IsLanguageMenuClosed();
    const canExit = !isAutoPlayOn && (isInIdle || IsInGamble(roundType) || IsInMatchTakeWin(roundType, options));
    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: canStartMatch, light: roundType === RoundType.Coins ? HwButtonLight.BlinkSlowA : HwButtonLight.On });
    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: canChangeBet, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: canChangeBet, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: canMaxBet, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: credits > 0 && !isAutoPlayOn, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: false, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: canStartMatch || isAutoPlayOn, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: !isAutoPlayOn && !options.disableInfoButton });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: canExit });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleRedHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleBlackHwButton).SetButtonState({ enabled: false });
  }

  private CanMaxBet(maxBet: number, currentBet: number, minBet: number, isInIdle: boolean, credits: number) {
    // can max bet when maxBet is valid & maxbet != currentBet, except in idle without more than the min bet
    return maxBet > 0 && maxBet !== currentBet && (!isInIdle || credits > minBet);
  }

  private CanChangeBet(nextBet: number, currentBet: number, minBet: number, isInIdle: boolean, credits: number) {
    // can change bet when nextBet is valid & nextBet != currentBet, or in idle without credits
    return (nextBet > 0 && nextBet !== currentBet && minBet <= credits) || (isInIdle && credits === 0);
  }

  private SetupSwButtons(roundType: RoundType, options: SetupViewsOptions) {
    const canChangeLanguages = this.IsLanguageMenuOpened() || (this.IsLanguageMenuClosed() && this.IsBetMenuClosed());
    const responsibleSwEnabled = roundType !== RoundType.Coins && roundType !== RoundType.Wheel && this.IsResponsibleGamingAvailable();
    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(roundType !== RoundType.Coins);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(!options.disableInfoButton);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(true);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(canChangeLanguages);
    this.RuntimeGet(IResponsibleSwButtonView).SetEnabled(responsibleSwEnabled);
    const exitTetraSwButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    exitTetraSwButton?.SetEnabled(false);
    exitTetraSwButton?.SetVisible(false);
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(!!options.startReeling);
    this.SetupVisibleButtons(roundType, options);
  }

  private SetupVisibleButtons(roundType: RoundType, options: SetupViewsOptions) {
    const canWheel = roundType === RoundType.Coins && !IsInMatchTakeWin(roundType, options);
    this.RuntimeGet(IExitGameSwButtonView).SetVisible(!canWheel);
    this.RuntimeGet(IBetUpSwButtonView).SetVisible(true);
    this.RuntimeGet(IBetDownSwButtonView).SetVisible(true);
    this.RuntimeGet(ILineUpSwButtonView).SetVisible(true);
    this.RuntimeGet(ILineDownSwButtonView).SetVisible(true);
  }

  private SetupBetButtons() {
    const canOpenBets = this.IsBetMenuOpened() || (this.IsLanguageMenuClosed() && this.IsBetMenuClosed());
    this.RuntimeGet(IBetUpSwButtonView).SetButtonState(canOpenBets, false, 'Bet Up', false);
    this.RuntimeGet(IBetDownSwButtonView).SetButtonState(canOpenBets, false, 'Bet Down', false);
  }

  private SetupLineButtons() {
    const betManager = this.Parent(IBetManager);
    const currentLine = betManager.GetCurrentLines();
    const canChangeLineUp = currentLine < betManager.GetMaxLines();
    const canChangeLineDown = currentLine > betManager.GetMinLines();
    this.RuntimeGet(ILineUpSwButtonView).SetButtonState(canChangeLineUp, false, 'Line Up', canChangeLineUp);
    this.RuntimeGet(ILineDownSwButtonView).SetButtonState(canChangeLineDown, false, 'Line Down', canChangeLineDown);
  }

  private DisableButtons(roundType: RoundType, options: SetupViewsOptions) {
    const isAutoPlayOn = this.Parent(IGameManager).IsAutoPlayOn();
    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(IsInMatchTakeWin(roundType, options));
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(!options.disableInfoButton);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(true);
    for (const button of [ILanguageSwButtonView, IBetUpSwButtonView, IBetDownSwButtonView, ILineUpSwButtonView, ILineDownSwButtonView, IResponsibleSwButtonView]) {
      this.RuntimeGet(button).SetEnabled(false);
    }
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(!!options.startReeling);
    const fastForward = !!options.enableFastForwardCollect && !isAutoPlayOn;
    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: fastForward });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: fastForward });
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: fastForward });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: !!options.enableFastForwardCollect || isAutoPlayOn, light: HwButtonLight.BlinkSlowA });
    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: true, light: isAutoPlayOn || roundType === RoundType.Coins ? HwButtonLight.BlinkSlowA : HwButtonLight.On });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: !options.disableInfoButton && !isAutoPlayOn });
    for (const button of [ICashoutHwButton, ICollectHwButton, IExitHwButton, IGambleHwButton, IGambleRedHwButton, IGambleBlackHwButton]) {
      this.RuntimeGet(button).SetButtonState({ enabled: false });
    }
    this.RuntimeGet(IBetMenuView).SetButtonUpEnabled(false);
    this.RuntimeGet(IBetMenuView).SetButtonDownEnabled(false);
    this.SetupVisibleButtons(roundType, options);
  }

  private BlockGameButtons(_roundType: RoundType, _options: SetupViewsOptions) {
    for (const button of [IExitGameSwButtonView, IInfoSwButtonView, ISoundVolumeSwButtonView, ILanguageSwButtonView, IBetUpSwButtonView, IBetDownSwButtonView,
      ILineUpSwButtonView, ILineDownSwButtonView, IResponsibleSwButtonView]) {
      this.RuntimeGet(button).SetEnabled(false);
    }
    const exitTetraSwButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    exitTetraSwButton?.SetEnabled(false);
    exitTetraSwButton?.SetVisible(false);
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(false);
    for (const button of [IStartHwButton, IIncreaseBetHwButton, IDecreaseBetHwButton, IMaxBetHwButton, IAutoPlayHwButton, IInfoHwButton, ICashoutHwButton,
      ICollectHwButton, IExitHwButton, IGambleHwButton, IGambleRedHwButton, IGambleBlackHwButton]) {
      this.RuntimeGet(button).SetButtonState({ enabled: false });
    }
    this.RuntimeGet(IBetMenuView).SetButtonUpEnabled(false);
    this.RuntimeGet(IBetMenuView).SetButtonDownEnabled(false);
  }

  private IsResponsibleGamingAvailable() {
    return this.RuntimeTryGetConst(IResponsibleGaming)?.IsResponsibleGamingSetupEnable() ?? false;
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
    return this.statics.languageMenuVisible && !this.statics.languageMenuMoving;
  }

  private IsLanguageMenuClosed() {
    return !this.statics.languageMenuVisible && !this.statics.languageMenuMoving;
  }

  private IsBetMenuOpened() {
    return this.statics.betMenuVisible && !this.statics.betMenuMoving;
  }

  private IsBetMenuClosed() {
    return !this.statics.betMenuVisible && !this.statics.betMenuMoving;
  }

  private TryGetSpinReelsCombinations(roundResult: RoundResult, options: SetupViewsOptions): ReelCombinations | null {
    if (options.showInitialStop || !options.showSpinReelsCombinations) return null;
    if (this.Parent(IBetManager).GetInitialBetModified()) return null;
    const phases = roundResult.GetPhases();
    const phase = phases[phases.length - 1];
    return phase instanceof SpinReelsPhase ? phase.combinations : null;
  }
}

EgtALogCategoryClass(ViewManager, 'ViewManager');
