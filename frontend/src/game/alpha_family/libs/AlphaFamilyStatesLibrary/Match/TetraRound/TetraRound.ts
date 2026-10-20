// Egt::Game::AlphaFamily::TetraRoundState (AlphaFamilyStatesLibrary/Match/TetraRound/TetraRound.h/.cpp): the tetra
// round, four sub screens played with the match's credits at four times the bet, while the credits last.

import { State } from '../../../../../engine/Fsm/Fsm';
import { Currencies } from '../../../../../engine/Game/Math/Common.data';
import { Currency, RoundType } from '../../../AlphaFamily/Math/Common/Common.data';
import { ReelRoundInput } from '../../../AlphaFamily/Math/Reel/ReelRoundInput.data';
import { IMathRules } from '../../../AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '../../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '../../../AlphaFamily/States/IBetManager';
import { IGameManager } from '../../../AlphaFamily/States/IGameManager';
import { IViewManager } from '../../../AlphaFamily/States/IViewManager';
import { ITetraRound, type TetraViewOptions } from '../../../AlphaFamily/States/Match/ITetraRound';
import { IBetBarView, ITetraSpinBarView } from '../../../AlphaFamily/Views/BarsView.bridge';
import { IBetMenuView } from '../../../AlphaFamily/Views/IBetMenuView.bridge';
import { ILinesView } from '../../../AlphaFamily/Views/ILinesView.bridge';
import { EBackgroundType, EKnobsType, IGameBackgroundView, IKnobsView } from '../../../AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '../../../AlphaFamily/Views/IReelsView.bridge';
import { ITetraRoundView } from '../../../AlphaFamily/Views/ITetraRoundView.bridge';
import { IWinFiguresView } from '../../../AlphaFamily/Views/IWinFiguresView.bridge';
import {
  ELanguageSwButtonType, ESoundSwButtonType, IExitGameSwButtonView, IExitTetraSwButtonView, IInfoSwButtonView, ILanguageSwButtonView, ISoundVolumeSwButtonView,
  IStopSingleReelSwButtonView,
} from '../../../AlphaFamily/Views/SwButtonViews.bridge';
import { TetraRoundPresentingStatics, TetraRoundStatics, TetraRoundStorage } from './TetraRound.data';

export class TetraRoundState extends State implements ITetraRound {
  static Interfaces = [ITetraRound];
  static Nvrams = [TetraRoundStorage];
  static Statics = [TetraRoundStatics, TetraRoundPresentingStatics];

  OnTransit() {
    if (!this.ConstNvram(TetraRoundStorage).roundInput) {
      const input = new ReelRoundInput();
      this.InitRoundInput(input);
      this.PrepareInput(input);
      this.Nvram(TetraRoundStorage).roundInput = input;
    }
    this.Parent(IGameManager).SetHasEnteredRound(this.GetRoundType(), true);
  }

  GetRoundType() {
    return RoundType.Tetra;
  }

  GetRoundRules() {
    return this.RuntimeGetConst(IMathRules).GetReelRoundRules(this.GetRoundType());
  }

  private InitRoundInput(input: ReelRoundInput) {
    const betManager = this.ConstParent(IBetManager);
    const initialBet = betManager.GetInitialBet();
    const subscreens = this.GetRoundRules().GetTetraSpinRules().GetSubScreenCount();
    input.roundType = RoundType.Tetra;
    input.bet = initialBet * subscreens;
    input.betType = Currency.Credits;
    input.lines = betManager.GetInitialLines();
    input.betPerLine = initialBet / input.lines;
    input.consume = new Currencies(Currency.Credits, input.bet);
    input.initialMatchCreditBet = this.RuntimeGetConst(IGameflow).GetInitialCreditsBet();
  }

  private PrepareInput(input: ReelRoundInput) {
    const betManager = this.Parent(IBetManager);
    betManager.SetCurrentBet(input.bet);
    betManager.SetCurrentLines(input.lines);
    this.GetRoundRules().PrepareInput(input, this.Parent(IGameManager).GetLastRoundResult());
  }

  SetupViews(options: TetraViewOptions) {
    // bet
    const input = this.ConstNvram(TetraRoundStorage).roundInput!;
    const roundRules = this.GetRoundRules();
    const initialBet = input.initialMatchCreditBet;
    const maxBet = initialBet * roundRules.GetMaxBetMultiplier();
    const minBet = initialBet * roundRules.GetMinBetMultiplier();
    const betManager = this.Parent(IBetManager);
    betManager.SetEditMode(!!options.enableInput);
    betManager.SetAllowedBets(roundRules.GetAllowedBets(minBet, maxBet));
    betManager.SetAllowedLines(roundRules.GetAllowedLines());
    betManager.SetBetLimit(this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits));

    // setup views
    this.Parent(IViewManager).SetupViews(RoundType.Tetra, {
      blockGameInput: false, enableButtons: options.enableButtons, setupOverlay: false, autoSelectInfoPage: options.autoSelectInfoPage,
      overrideSpecialRoundView: RoundType.Tetra,
    });
    this.SetupSwButtons(options);
    this.SetupBetMenuView(options);

    // tetra reels
    const tetraView = this.RuntimeGet(ITetraRoundView);
    const fakeReels = roundRules.GetFakeReels();
    const subScreenCount = roundRules.GetTetraSpinRules().GetSubScreenCount();
    for (let i = 0; i < subScreenCount; ++i) tetraView.SetupFakeReels(i, fakeReels);
    if (options.startReeling) tetraView.StartReeling();

    // tetra bar
    const tetraSpinBarView = this.RuntimeTryGet(ITetraSpinBarView);
    if (tetraSpinBarView) {
      const currentConsecutiveRound = this.RuntimeGetConst(IGameflow).GetLastConsecutiveRoundCount(RoundType.Tetra);
      tetraSpinBarView.SetCurrentCounter(currentConsecutiveRound);
      tetraSpinBarView.SetTotalCounterTarget(this.CalculateTetraRemainingSpins(currentConsecutiveRound));
      tetraSpinBarView.SetVisible(true);
    }
    tetraView.SetVisible(true);

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
    const currentCredit = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);
    const currentBet = this.Parent(IBetManager).GetCurrentBet();
    const tetraMaxRounds = this.RuntimeGetConst(IMathRules).GetReelRoundRules(RoundType.Tetra).GetTetraSpinRules().GetTetraMaxRounds();
    return Math.min(Math.trunc(currentCredit / currentBet) + currentSpin, tetraMaxRounds);
  }

  private SetupBetMenuView(options: TetraViewOptions) {
    const betManager = this.Parent(IBetManager);
    const subScreenCount = this.GetRoundRules().GetTetraSpinRules().GetSubScreenCount();
    const menu = this.RuntimeGet(IBetMenuView);
    const currentBetPerSubscreen = betManager.GetCurrentBet() / subScreenCount;
    const allowedBetsPerSubscreen = betManager.GetAllowedBetsIncludingSelected().map(bet => bet / subScreenCount);
    const betLimitPerSubscreen = betManager.GetBetLimit() / subScreenCount;
    const minAllowedBetPerSubscreen = allowedBetsPerSubscreen[0];
    const maxAllowedBetPerSubscreen = Math.min(betLimitPerSubscreen, allowedBetsPerSubscreen[allowedBetsPerSubscreen.length - 1]);
    menu.SetPossibleTotalBets(allowedBetsPerSubscreen);
    menu.SetPossibleLines(this.GetRoundRules().GetAllowedLines());
    menu.SetSelectedTotalBet(currentBetPerSubscreen);
    menu.SetBetLimit(betLimitPerSubscreen);
    menu.SetSelectedLines(betManager.GetCurrentLines());
    menu.SetCurrency(betManager.GetBetCurrency());
    if (options.startReeling) menu.CloseMenu();
    menu.SetButtonUpEnabled(currentBetPerSubscreen < maxAllowedBetPerSubscreen);
    menu.SetButtonDownEnabled(currentBetPerSubscreen > minAllowedBetPerSubscreen);
    const bar = this.RuntimeGet(IBetBarView);
    bar.SetValueNow(betManager.GetCurrentBet());
    bar.SetCurrency(betManager.GetBetCurrency());
    bar.SetSkin('');
  }

  private SetupSwButtons(options: TetraViewOptions) {
    const enableInput = !!options.enableInput;
    const collectTetraButton = this.RuntimeTryGet(IExitTetraSwButtonView);
    collectTetraButton?.SetEnabled(enableInput);
    collectTetraButton?.SetVisible(true);
    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(false);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(false);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(enableInput);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(enableInput);
    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(false);
    // visible
    this.RuntimeGet(IExitGameSwButtonView).SetVisible(false);
  }
}
