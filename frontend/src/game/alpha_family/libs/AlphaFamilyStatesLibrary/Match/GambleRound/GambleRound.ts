// Egt::Game::AlphaFamily::GambleRoundState (AlphaFamilyStatesLibrary/Match/GambleRound/GambleRound): the red or black
// gamble, which bets all the match's credits (and a gamble token) to double them.

import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import {
  HwButtonLight, IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IDecreaseBetHwButton, IExitHwButton, IGambleBlackHwButton,
  IGambleHwButton, IGambleRedHwButton, IIncreaseBetHwButton, IInfoHwButton, IMaxBetHwButton, IStartHwButton,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { IWallet } from '@game/engine/Game/RuntimeImport/IWallet';
import { IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { type int, type int8_t, static_cast } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, ERightStatusLine, EStatusLine, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { WheelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundInput.data';
import { WheelRoundPhase } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundPhase.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { type GambleViewOptions, IGambleRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IGambleRound';
import { EWinBarState, IBetBarView, ICoinsBarView, ICreditBarView, ICreditsWinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBetMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { IGambleRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundView.bridge';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import {
  IBetDownSwButtonView, IBetUpSwButtonView, IExitGameSwButtonView, IGambleBlackSwButtonView, IGambleRedSwButtonView, IInfoSwButtonView,
  ILanguageSwButtonView, ILineDownSwButtonView, ILineUpSwButtonView, IResponsibleSwButtonView, ISoundVolumeSwButtonView,
  IStopSingleReelSwButtonView, ITakeCoinsSwButtonView, IWheelCancelSwButtonView, IWheelStartSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { GambleRoundStorage } from './GambleRound.data';

export interface GambleRoundStatics {}
// eslint-disable-next-line @typescript-eslint/no-extraneous-class, @typescript-eslint/no-unsafe-declaration-merging
export class GambleRoundStatics {}

export class GambleRoundState extends State implements IGambleRound {
  static Interfaces = [IGambleRound];
  static Nvrams = [GambleRoundStorage];
  static Statics = [GambleRoundStatics];

  // State
  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    if (!this.ConstNvram(GambleRoundStorage).roundInput) {
      const input = new WheelRoundInput();
      this.InitRoundInput(input);
      assert(input.roundType === this.GetRoundType());
      assert(input.bet > 0);
      assert(!input.consume.empty());

      this.Nvram(GambleRoundStorage).roundInput = input;
    }
    // base view setup
    {
      // Parent<IViewManager>().SetupViewsLastResult(
      //     {.enableButtons = false, .showSpinReelsCombinations = false, .autoSelectInfoPage = false});

      this.SetupViews({});
    }

    this.Parent(IGameManager).SetHasEnteredRound(this.GetRoundType(), true);
  }

  // IRound
  GetRoundType() {
    return RoundType.Gamble;
  }

  // IGambleRound
  GetRoundRules() {
    const roundType = this.GetRoundType();
    const roundRules = this.RuntimeGetConst(IMathRules).GetWheelRoundRules(roundType);
    return roundRules;
  }

  SetupViews(options: GambleViewOptions) {
    // bet
    const input = this.ConstNvram(GambleRoundStorage).roundInput;
    const bet = input!.bet;
    const betManager = this.Parent(IBetManager);
    const gameflow = this.RuntimeGetConst(IGameflow);
    // update bet
    this.RuntimeGet(IBetMenuView).SetSelectedTotalBet(bet);
    this.RuntimeGet(IBetBarView).SetValueNow(betManager.GetCurrentBet());

    this.Parent(IViewManager).SetupViews(
      RoundType.Gamble,
      { autoSelectInfoPage: options.autoSelectInfoPage, overrideSpecialRoundView: RoundType.Gamble });

    // setup buttons
    {
      this.RuntimeGet(IExitGameSwButtonView).SetEnabled(!!options.enableInput);
      this.RuntimeGet(IBetUpSwButtonView).SetEnabled(false);
      this.RuntimeGet(IBetDownSwButtonView).SetEnabled(false);
      this.RuntimeGet(IInfoSwButtonView).SetEnabled(true);
      this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(true);
      this.RuntimeGet(ILanguageSwButtonView).SetEnabled(false);
      this.RuntimeGet(IGambleRedSwButtonView).SetEnabled(!!options.enableInput);
      this.RuntimeGet(IGambleBlackSwButtonView).SetEnabled(!!options.enableInput);
      this.RuntimeGet(IResponsibleSwButtonView).SetEnabled(false);
      this.RuntimeGet(ITakeCoinsSwButtonView).SetEnabled(false);
      this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(false);
      this.RuntimeGet(IWheelCancelSwButtonView).SetEnabled(false);
      this.RuntimeGet(IWheelStartSwButtonView).SetEnabled(false);

      // visible
      this.RuntimeGet(IExitGameSwButtonView).SetVisible(true);
      this.RuntimeGet(ITakeCoinsSwButtonView).SetVisible(false);
      this.RuntimeGet(ILineUpSwButtonView).SetVisible(false);
      this.RuntimeGet(ILineDownSwButtonView).SetVisible(false);
      this.RuntimeGet(IWheelCancelSwButtonView).SetVisible(false);
      this.RuntimeGet(IWheelStartSwButtonView).SetVisible(false);
    }

    // hw buttons
    {
      this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: !!options.enableInput });
      this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: false });
      this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: false });
      this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: false });
      this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: false });
      this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: !!options.enableInput });
      this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: !!options.enableInput });
      this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
      this.RuntimeGet(ICashoutHwButton).SetButtonState(
        { enabled: !!options.enableInput, light: HwButtonLight.BlinkSlowA });
      this.RuntimeGet(ICollectHwButton).SetButtonState(
        { enabled: !!options.enableInput, light: HwButtonLight.BlinkSlowA });
      this.RuntimeGet(IGambleRedHwButton).SetButtonState(
        { enabled: !!options.enableInput, light: HwButtonLight.BlinkFastA });
      this.RuntimeGet(IGambleBlackHwButton).SetButtonState(
        { enabled: !!options.enableInput, light: HwButtonLight.BlinkFastB });
    }

    // status line
    {
      const statusLineView = this.RuntimeGet(IStatusLineView);
      statusLineView.SetVisible(true);
      statusLineView.ShowStatus(EStatusLine.SelectRedBlack);
      statusLineView.ShowRightStatus(ERightStatusLine.None);
    }

    // bars
    {
      const winBar = this.RuntimeGet(ICreditsWinBarView);
      winBar.SetLabelState(EWinBarState.Win);
      if (options.overrideWinBar !== undefined) {
        winBar.SetValueNow(options.overrideWinBar);
      } else {
        const rewarded = gameflow.GetMatchCurrenciesAvailable().Get(Currency.Credits);
        winBar.SetValueNow(rewarded);
      }
    }
    {
      const coinsBar = this.RuntimeTryGet(ICoinsBarView);
      if (coinsBar) {
        const coinsSpinEnergy = gameflow.GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy);
        coinsBar.SetValueNow(coinsSpinEnergy);
        coinsBar.Minimize(false);
      }
    }
    {
      const creditBar = this.RuntimeTryGet(ICreditBarView);
      if (creditBar) {
        const credits = this.RuntimeGet(IWallet).GetCredit();
        creditBar.SetValueNow(credits);
        creditBar.Maximize(false);
      }
    }

    // gamble
    {
      const gambleView = this.RuntimeGet(IGambleRoundView);

      gambleView.SetAttemptsLeft(static_cast<int>(gameflow.GetMatchCurrencyAvailable(Currency.GambleToken)));
      gambleView.SetBet(bet);
      const gambleViewHistory: int8_t[] = [];
      {
        const gambleHistory = this.Parent(IGameManager).GetLastNHistoryResultsBy(RoundType.Gamble, 6);
        for (const roundResult of gambleHistory) {
          assert(roundResult.GetRoundType() === RoundType.Gamble);
          const phaseIndex: int = 0;
          const phases = roundResult.GetPhases(this.GetRuntime());
          assert(IsValidIndex(phases, phaseIndex));

          const phase = phases[phaseIndex];
          assert(phase instanceof WheelRoundPhase);

          const gamblePhase = phase as WheelRoundPhase;
          gambleViewHistory.push(static_cast<int8_t>(gamblePhase.stopSector));
        }
      }
      gambleView.SetHistory(gambleViewHistory);
      gambleView.SetVisible(true);

      this.RuntimeGet(IGambleRedSwButtonView).SetVisible(true);
      this.RuntimeGet(IGambleBlackSwButtonView).SetVisible(true);
    }

    // hide
    this.RuntimeGet(IKnobsView).SetVisible(false);
    this.RuntimeGet(IWinFiguresView).ClearFigures();
    this.RuntimeGet(ILinesView).ClearLines();
    this.RuntimeGet(IReelsView).ClearCombinations();

    if (options.autoSelectInfoPage) {
      this.RuntimeGet(IInfoView).ShowRoundInfo(RoundType.Gamble, false);
    }
  }

  private InitRoundInput(input: WheelRoundInput) {
    const currentCreditsRisked = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.Credits);

    input.roundType = RoundType.Gamble;
    input.bet = currentCreditsRisked;
    input.betGroup = -1; // invalid. Must be set on input (red/black)
    input.consume = new Currencies(Currency.GambleToken, 1).Plus(new Currencies(Currency.Credits, currentCreditsRisked));
  }
}

EgtALogCategoryClass(GambleRoundState, 'GambleRoundState');
