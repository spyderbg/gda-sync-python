// Egt::Game::AlphaFamily::TetraRoundState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRound.h/.cpp): the tetra
// round, four sub screens played with the match's credits at four times the bet, while the credits last.

import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import type { int } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { ReelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ITetraRound, type TetraViewOptions } from '@game/alpha_family/libs/AlphaFamily/States/Match/ITetraRound';
import { IBetBarView, ITetraSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBetMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { EBackgroundType, EKnobsType, IGameBackgroundView, IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { ITetraRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/ITetraRoundView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import {
  ELanguageSwButtonType, ESoundSwButtonType, IExitGameSwButtonView, IExitTetraSwButtonView, IInfoSwButtonView, ILanguageSwButtonView, ISoundVolumeSwButtonView,
  IStopSingleReelSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { TetraRoundStatics, TetraRoundStorage } from './TetraRound.data';

export class TetraRoundState extends State implements ITetraRound {
  static Interfaces = [ITetraRound];
  static Nvrams = [TetraRoundStorage];
  static Statics = [TetraRoundStatics];

  OnTransit(isStartup: boolean, isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.GetRoundType(), isStartup ? 'isStartup' : '', isRecovery ? 'isRecovery' : '');
    void isStartup;
    void isRecovery;

    if (!this.ConstNvram(TetraRoundStorage).roundInput) {
      const input = new ReelRoundInput();
      this.InitRoundInput(input);
      this.PrepareInput(input);

      assert(input.roundType === this.GetRoundType());
      assert(input.bet > 0);
      assert(input.lines > 0);
      assert(input.betPerLine > 0);
      assert(!input.consume.empty());

      this.Nvram(TetraRoundStorage).roundInput = input;
    }

    this.Parent(IGameManager).SetHasEnteredRound(this.GetRoundType(), true);
  }

  GetRoundType() {
    return RoundType.Tetra;
  }

  GetRoundRules() {
    const roundType = this.GetRoundType();
    const roundRules = this.RuntimeGetConst(IMathRules).GetReelRoundRules(roundType);
    return roundRules;
  }

  private InitRoundInput(input: ReelRoundInput) {
    const gameflow = this.RuntimeGetConst(IGameflow);
    const betManager = this.ConstParent(IBetManager);
    const initialBet = betManager.GetInitialBet();
    const subscreens = this.GetRoundRules().GetTetraSpinRules().GetSubScreenCount();

    input.roundType = RoundType.Tetra;
    input.bet = initialBet * subscreens;
    input.betType = Currency.Credits;
    input.lines = betManager.GetInitialLines();
    input.betPerLine = initialBet / input.lines;
    input.consume = new Currencies(Currency.Credits, input.bet);
    input.initialMatchCreditBet = gameflow.GetInitialCreditsBet();
  }

  private PrepareInput(input: ReelRoundInput) {
    const betManager = this.Parent(IBetManager);
    betManager.SetCurrentBet(input.bet);
    betManager.SetCurrentLines(input.lines);

    const lastResult = this.Parent(IGameManager).GetLastRoundResult();
    const rules = this.GetRoundRules();

    rules.PrepareInput(input, lastResult);
  }

  SetupViews(options: TetraViewOptions) {
    // bet
    // update bet
    // setup views
    this.Parent(IViewManager).SetupViews(RoundType.Tetra, {
      blockGameInput: false, //! options.enableInput,
      enableButtons: options.enableButtons,
      setupOverlay: false,
      autoSelectInfoPage: options.autoSelectInfoPage,
      overrideSpecialRoundView: RoundType.Tetra,
    });

    // setup buttons
    this.SetupSwButtons(options);

    // hw buttons
    // {
    //     RuntimeGet<IStartHwButton>().SetButtonState({.enabled = options.enableInput});
    //     RuntimeGet<IIncreaseBetHwButton>().SetButtonState({.enabled = false});
    //     RuntimeGet<IDecreaseBetHwButton>().SetButtonState({.enabled = false});
    //     RuntimeGet<IMaxBetHwButton>().SetButtonState({.enabled = false});
    //     RuntimeGet<IAutoPlayHwButton>().SetButtonState({.enabled = false});
    //     RuntimeGet<IInfoHwButton>().SetButtonState({.enabled = true});
    //     RuntimeGet<IExitHwButton>().SetButtonState({.enabled = options.enableInput});
    //     RuntimeGet<IGambleHwButton>().SetButtonState({.enabled = false});
    //     RuntimeGet<ICashoutHwButton>().SetButtonState({.enabled = options.enableInput});
    //     RuntimeGet<ICollectHwButton>().SetButtonState({.enabled = options.enableInput});
    //     RuntimeGet<IGambleRedHwButton>().SetButtonState(
    //         {.enabled = options.enableInput, .light = HwButtonLight::BlinkFastA});
    //     RuntimeGet<IGambleBlackHwButton>().SetButtonState(
    //         {.enabled = options.enableInput, .light = HwButtonLight::BlinkFastB});
    // }

    // bars
    // menus
    this.SetupBetMenuView(options);
    // tetra reels
    {
      const tetraView = this.RuntimeGet(ITetraRoundView);
      const rules = this.GetRoundRules();
      const fakeReels = rules.GetFakeReels();
      const subScreenCount: int = rules.GetTetraSpinRules().GetSubScreenCount();
      for (let i: int = 0; i < subScreenCount; ++i) {
        tetraView.SetupFakeReels(i, fakeReels);
      }
      if (options.startReeling) {
        tetraView.StartReeling();
      }
    }
    // tetra bar
    const tetraSpinBarView = this.RuntimeTryGet(ITetraSpinBarView);
    if (tetraSpinBarView) {
      const gameflow = this.RuntimeGetConst(IGameflow);

      const currentConsecutiveRound = gameflow.GetLastConsecutiveRoundCount(RoundType.Tetra);

      tetraSpinBarView.SetCurrentCounter(currentConsecutiveRound);
      tetraSpinBarView.SetTotalCounterTarget(this.CalculateTetraRemainingSpins(currentConsecutiveRound));
      tetraSpinBarView.SetVisible(true);
    }

    this.RuntimeGet(ITetraRoundView).SetVisible(true);

    // hide
    this.RuntimeGet(IKnobsView).SetKnobsType(EKnobsType.Tetra);
    this.RuntimeGet(IGameBackgroundView).SetBackgroundType(EBackgroundType.Tetra);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetButtonType(ESoundSwButtonType.Tetra);
    this.RuntimeGet(ILanguageSwButtonView).SetButtonType(ELanguageSwButtonType.Tetra);

    this.RuntimeGet(IWinFiguresView).ClearFigures();
    this.RuntimeGet(ILinesView).ClearLines();
    this.RuntimeGet(IReelsView).ClearCombinations();
    this.RuntimeGet(IReelsView).SetVisible(false);
  }

  private CalculateTetraRemainingSpins(currentSpin: number) {
    const gameflow = this.RuntimeGetConst(IGameflow);

    const currentCredit = gameflow.GetMatchCurrencyAvailable(Currency.Credits);

    const betManager = this.Parent(IBetManager);
    const currentBet = betManager.GetCurrentBet();

    const mathRules = this.RuntimeGetConst(IMathRules);

    const roundRules = mathRules.GetReelRoundRules(RoundType.Tetra);

    return Math.min(Math.trunc(currentCredit / currentBet) + currentSpin, roundRules.GetTetraSpinRules().GetTetraMaxRounds());
  }

  private SetupBetMenuView(options: TetraViewOptions) {
    const betManager = this.Parent(IBetManager);
    const rules = this.GetRoundRules();
    const subScreenCount = rules.GetTetraSpinRules().GetSubScreenCount();
    const menu = this.RuntimeGet(IBetMenuView);
    const currentBetPerSubscreen = betManager.GetCurrentBet() / subScreenCount;
    const allowedBetsPerSubscreen = betManager.GetAllowedBetsIncludingSelected().map(bet => bet / subScreenCount);
    const betLimitPerSubscreen = betManager.GetBetLimit() / subScreenCount;
    const minAllowedBetPerSubscreen = allowedBetsPerSubscreen[0];
    const maxAllowedBetPerSubscreen = Math.min(betLimitPerSubscreen, allowedBetsPerSubscreen[allowedBetsPerSubscreen.length - 1]);

    menu.SetPossibleTotalBets(allowedBetsPerSubscreen);
    menu.SetPossibleLines(rules.GetAllowedLines());
    menu.SetSelectedTotalBet(currentBetPerSubscreen);
    menu.SetBetLimit(betLimitPerSubscreen);
    menu.SetSelectedLines(betManager.GetCurrentLines());
    menu.SetCurrency(betManager.GetBetCurrency());
    if (options.startReeling) {
      menu.CloseMenu();
    }

    const canChangeBetUp = (currentBetPerSubscreen < maxAllowedBetPerSubscreen);
    menu.SetButtonUpEnabled(canChangeBetUp);
    const canChangeBetDown = (currentBetPerSubscreen > minAllowedBetPerSubscreen);
    menu.SetButtonDownEnabled(canChangeBetDown);

    const bar = this.RuntimeGet(IBetBarView);
    bar.SetValueNow(betManager.GetCurrentBet());
    bar.SetCurrency(betManager.GetBetCurrency());
    bar.SetSkin('');
  }

  private SetupSwButtons(options: TetraViewOptions) {
    const enableInput = !!options.enableInput;
    const collectTetraButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    if (collectTetraButton) {
      collectTetraButton.SetEnabled(enableInput);
      collectTetraButton.SetVisible(true);
    }

    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(false);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(false);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(enableInput);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(enableInput);
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(false);

    // visible
    this.RuntimeGet(IExitGameSwButtonView).SetVisible(false);
  }
}

EgtALogCategoryClass(TetraRoundState, 'TetraRoundState');
