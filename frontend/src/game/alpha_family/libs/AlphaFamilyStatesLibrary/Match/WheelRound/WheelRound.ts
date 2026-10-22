// Egt::Game::AlphaFamily::WheelRoundState (AlphaFamilyStatesLibrary/Match/WheelRound/WheelRound): the coins wheel,
// which bets all the match's coins (and its wheel token) for credits.

import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import {
  IAutoPlayHwButton, ICashoutHwButton, ICollectHwButton, IDecreaseBetHwButton, IExitHwButton, IGambleBlackHwButton, IGambleHwButton,
  IGambleRedHwButton, IIncreaseBetHwButton, IInfoHwButton, IMaxBetHwButton, IStartHwButton,
} from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { IWallet } from '@game/engine/Game/RuntimeImport/IWallet';
import { FindIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { assert } from '@game/engine/GameCore/Common/Defensive';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { WheelRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundInput.data';
import type { WheelRewardsPerSector } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { ISystemManager } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { IWheelRound, type WheelViewOptions } from '@game/alpha_family/libs/AlphaFamily/States/Match/IWheelRound';
import { IBetBarView, ICoinsBarView, ICreditBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IBetMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IBetMenuView.bridge';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILinesView } from '@game/alpha_family/libs/AlphaFamily/Views/ILinesView.bridge';
import { ILanguageMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { IWheelRoundView } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { IWinFiguresView } from '@game/alpha_family/libs/AlphaFamily/Views/IWinFiguresView.bridge';
import {
  IBetDownSwButtonView, IBetUpSwButtonView, IExitGameSwButtonView, IGambleBlackSwButtonView, IGambleRedSwButtonView, IInfoSwButtonView,
  ILanguageSwButtonView, ILineDownSwButtonView, ILineUpSwButtonView, IResponsibleSwButtonView, ISoundVolumeSwButtonView,
  IStopSingleReelSwButtonView, ITakeCoinsSwButtonView, IWheelCancelSwButtonView, IWheelStartSwButtonView,
} from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { WheelRoundStorage } from './WheelRound.data';

export interface WheelRoundStatics {}
// eslint-disable-next-line @typescript-eslint/no-extraneous-class, @typescript-eslint/no-unsafe-declaration-merging
export class WheelRoundStatics {}

export class WheelRoundState extends State implements IWheelRound {
  static Interfaces = [IWheelRound];
  static Nvrams = [WheelRoundStorage];
  static Statics = [WheelRoundStatics];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    if (!this.ConstNvram(WheelRoundStorage).roundInput) {
      const input = new WheelRoundInput();
      this.InitRoundInput(input);
      assert(input.roundType === this.GetRoundType());
      assert(input.bet > 0);
      assert(!input.consume.empty());

      this.Nvram(WheelRoundStorage).roundInput = input;
    }
    this.Parent(IGameManager).SetHasEnteredRound(this.GetRoundType(), true);
  }

  GetRoundType() {
    return RoundType.Wheel;
  }

  GetRoundRules() {
    const roundType = this.GetRoundType();
    const roundRules = this.RuntimeGetConst(IMathRules).GetWheelRoundRules(roundType);
    return roundRules;
  }

  SetupViews(options: WheelViewOptions) {
    // bet
    const input = this.ConstNvram(WheelRoundStorage).roundInput;
    const bet = input!.bet;

    const betManager = this.Parent(IBetManager);
    betManager.SetEditMode(false);
    betManager.SetAllowedBets([bet]);
    betManager.SetAllowedLines([0]);
    betManager.SetBetLimit(bet);

    // update bet
    this.RuntimeGet(IBetMenuView).SetSelectedTotalBet(bet);

    const hasPendingCashout = this.Parent(ISystemManager).HasPendingCashout();

    this.Parent(IViewManager).SetupViews(RoundType.Wheel, {
      blockGameInput: hasPendingCashout,
      enableButtons: options.enableButtons ?? false,
      overrideCoinsBar: options.overrideCoinsBar,
      overrideWinBar: options.overrideWinBar,
      overrideBetBar: bet,
      autoSelectInfoPage: options.autoSelectInfoPage ?? false,
      overrideSpecialRoundView: RoundType.Wheel,
    });

    this.RuntimeGet(IIncreaseBetHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IDecreaseBetHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IMaxBetHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IAutoPlayHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IInfoHwButton).SetButtonState({ enabled: options.enableButtons && !hasPendingCashout });
    this.RuntimeGet(ICashoutHwButton).SetButtonState({ enabled: options.enableButtons && !hasPendingCashout });
    this.RuntimeGet(ICollectHwButton).SetButtonState({ enabled: options.enableButtons && !hasPendingCashout });
    this.RuntimeGet(IExitHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: options.enableButtons && !hasPendingCashout });
    this.RuntimeGet(IGambleHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleRedHwButton).SetButtonState({ enabled: false });
    this.RuntimeGet(IGambleBlackHwButton).SetButtonState({ enabled: false });

    this.RuntimeGet(IExitGameSwButtonView).SetEnabled(false);
    this.RuntimeGet(IInfoSwButtonView).SetEnabled(true);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetEnabled(true);
    this.RuntimeGet(ILanguageSwButtonView).SetEnabled(false);
    this.RuntimeGet(IResponsibleSwButtonView).SetEnabled(false);

    const takeCoinsSWButton = this.RuntimeTryGet(ITakeCoinsSwButtonView);
    if (takeCoinsSWButton) {
      takeCoinsSWButton.SetEnabled(false);
    }

    this.RuntimeGet(IStopSingleReelSwButtonView).SetEnabled(false);
    this.RuntimeGet(IWheelCancelSwButtonView).SetEnabled(!!options.enableButtons && !!options.enableCancelButton);
    this.RuntimeGet(IWheelStartSwButtonView).SetEnabled(!!options.enableButtons && !hasPendingCashout);

    const redBtn = this.RuntimeTryGet(IGambleRedSwButtonView);
    if (redBtn) {
      redBtn.SetEnabled(false);
      redBtn.SetVisible(false);
    }

    const blackBtn = this.RuntimeTryGet(IGambleBlackSwButtonView);
    if (blackBtn) {
      blackBtn.SetEnabled(false);
      blackBtn.SetVisible(false);
    }

    // visible
    {
      const takeCoinsSWButton = this.RuntimeTryGet(ITakeCoinsSwButtonView);
      if (takeCoinsSWButton) {
        takeCoinsSWButton.SetVisible(false);
      }
    }
    this.RuntimeGet(IExitGameSwButtonView).SetVisible(false);
    this.RuntimeGet(IBetUpSwButtonView).SetVisible(false);
    this.RuntimeGet(IBetDownSwButtonView).SetVisible(false);
    this.RuntimeGet(ILineUpSwButtonView).SetVisible(false);
    this.RuntimeGet(ILineDownSwButtonView).SetVisible(false);
    this.RuntimeGet(IWheelCancelSwButtonView).SetVisible(true);
    this.RuntimeGet(IWheelStartSwButtonView).SetVisible(true);

    // bars
    const creditsView = this.RuntimeTryGet(ICreditBarView);
    if (creditsView) {
      const credits = this.RuntimeGet(IWallet).GetCredit();
      creditsView.SetValueNow(credits);
      creditsView.Minimize(false);
    }

    const bar = this.RuntimeGet(IBetBarView);
    bar.SetSkin('Silent');
    bar.SetCurrency(Currency.CoinsSpinEnergy);
    bar.SetValueNow(bet);

    // coins
    const coinsView = this.RuntimeTryGet(ICoinsBarView);
    if (coinsView) {
      const coinsSpinEnergy = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy);
      coinsView.SetValueNow(coinsSpinEnergy);

      coinsView.Maximize(false);
    }

    // info
    const infoScreen = this.RuntimeTryGet(IInfoView);
    if (infoScreen && options.autoSelectInfoPage) {
      infoScreen.ShowRoundInfo(RoundType.Wheel, false);
    }

    // hide
    this.RuntimeGet(IKnobsView).SetVisible(false);
    this.RuntimeGet(IStatusLineView).SetVisible(false);
    this.RuntimeGet(IWinFiguresView).ClearFigures();
    this.RuntimeGet(ILinesView).SetVisible(false);
    this.RuntimeGet(ILinesView).StopWinLinesSounds('');
    this.RuntimeGet(IReelsView).ClearCombinations();

    this.RuntimeGet(ILanguageMenuView).CloseMenu();
    this.RuntimeGet(ILanguageMenuView).SetVisible(false);

    this.RuntimeGet(IBetMenuView).CloseMenu();
    this.RuntimeGet(IBetMenuView).SetVisible(false);

    // wheel
    const sectorWins: number[] = [];
    {
      const wheelRules = this.RuntimeGetConst(IMathRules).GetWheelRoundRules(RoundType.Wheel);
      const rewardsPerSector: WheelRewardsPerSector = wheelRules.GetWheelRewardsPerSector(bet);

      // gather all keys
      for (const [, reward] of rewardsPerSector) {
        sectorWins.push(reward.Get(Currency.Credits));
      }

      // apply cap to visual sectors
      this.ApplyCapping(sectorWins);
    }

    const maxWinSectorIndex = FindIndex(sectorWins, Math.max(...sectorWins));
    const startSectorIndex = options.overrideStartSector ?? maxWinSectorIndex;

    const wheel = this.RuntimeGet(IWheelRoundView);
    wheel.SetSectorWins(sectorWins, startSectorIndex);
    wheel.SetVisible(true);
  }

  private ApplyCapping(sectorWins: number[]) {
    // cap values for sectors send to views
    const winCapping = this.RuntimeGetConst(ILimits).GetWinCapping();
    if (winCapping.capping <= 0) return; // no capping
    if (!winCapping.capValueWinBar) return; // no need to cap win bar value

    for (let i = 0; i < sectorWins.length; i++) {
      sectorWins[i] = Math.min(sectorWins[i], winCapping.capping);
    }
  }

  private InitRoundInput(input: WheelRoundInput) {
    const currentCoinsEnergy = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.CoinsSpinEnergy);

    input.roundType = RoundType.Wheel;
    input.bet = currentCoinsEnergy;
    input.betGroup = 0; // bet all sectors
    input.consume = new Currencies(Currency.WheelToken, 1).Plus(new Currencies(Currency.CoinsSpinEnergy, input.bet));
  }
}

EgtALogCategoryClass(WheelRoundState, 'WheelRoundState');
