// Egt::Game::AlphaFamily::HoldAndSpinRoundState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRound): a
// hold and spin round, which consumes HoldAndSpinEnergy; its input follows the reel round that triggered it.

import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import { Contains, IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf, assert } from '@game/engine/GameCore/Common/Defensive';
import { Copy } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType, type SymbolGrid, type SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundInput.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import type { RoundResult } from '@game/alpha_family/libs/AlphaFamily/Math/RoundResult.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager, type SetupViewsOptions } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { HoldAndSpinReelSetup, type HoldAndSpinViewOptions, IHoldAndSpinRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IHoldAndSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { IHoldAndSpinRoundInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { IHoldAndSpinRoundOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';
import { EReelsOverlayType, IReelsOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsOverlayView.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

export class HoldAndSpinRoundState extends State implements IHoldAndSpinRound {
  static Interfaces = [IHoldAndSpinRound];
  static Nvrams = [HoldAndSpinRoundStorage];

  // True while this round's result still leaves HoldAndSpinEnergy to play.
  // The wallet does not show that until EndRound applies the override.
  private static HasRemainingSpins(result: RoundResult) {
    const overrides = result.m_overrideCurrencies;
    for (const [currency, amount] of overrides) {
      if (currency === Currency.HoldAndSpinEnergy) return amount > 0;
    }
    // CalculateRound always writes HoldAndSpinEnergy. Without it the remaining count is unknown,
    // so the spins label stays.
    assert(false);
    return true;
  }

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {} {}', this.GetRoundType(), _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    if (!this.ConstNvram(HoldAndSpinRoundStorage).roundInput) {
      const input = new HoldAndSpinRoundInput();
      this.InitRoundInput(input);
      this.PrepareInput(input);

      this.Nvram(HoldAndSpinRoundStorage).roundInput = input;
    }
  }

  GetRoundType() {
    return RoundType.HoldAndSpin;
  }

  GetTriggerRoundType() {
    const input = this.ConstNvram(HoldAndSpinRoundStorage).roundInput;

    if (input) {
      return input.triggerRoundType;
    } else {
      const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();
      return lastResult.GetTriggerRoundType();
    }
  }

  GetRoundRules() {
    const roundType = this.GetTriggerRoundType();
    const roundRules = this.RuntimeGetConst(IMathRules).GetHoldAndSpinRoundRules(roundType);

    return roundRules;
  }

  SetupViews(options: HoldAndSpinViewOptions) {
    let vmOptions: SetupViewsOptions = {
      startReeling: options.startReeling ?? false,
      setupReels: options.setupReels ?? true,
      overrideCoinsBar: options.overrideCoinsBar,
      overrideWinBar: options.overrideWinBar,
      disableInfoButton: options.disableInfoButton ?? false,
      overrideSpecialRoundView: RoundType.HoldAndSpin,
    };

    if (options.startReeling) {
      vmOptions.overrideFakeReels = RoundType.HoldAndSpin;
    }

    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    if (nvram.roundResult) {
      this.Parent(IViewManager).SetupViews(nvram.roundResult, vmOptions);
    } else {
      this.Parent(IViewManager).SetupViewsLastResult(vmOptions);
    }

    // After ViewManager (SetupWinCombination clears win figures and reel combinations).
    const reelSetup = options.reelSetup ?? HoldAndSpinReelSetup.None;
    if (reelSetup !== HoldAndSpinReelSetup.None) {
      this.ApplyHoldAndSpinReelSetup(reelSetup);
    }

    if (options.showMainInfo) {
      this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowMain();
    }

    this.SetFeatureStartedViews(options.featureStarted ?? true);

    if (options.showSpinsCompleted) {
      const barView = this.RuntimeTryGet(IHoldAndSpinBarView);
      if (barView) {
        barView.ShowCompleted(false);
      }
    }

    const nvramForSpinsBar = this.ConstNvram(HoldAndSpinRoundStorage);
    const spinsExhausted: boolean =
      nvramForSpinsBar.roundResult !== null && !HoldAndSpinRoundState.HasRemainingSpins(nvramForSpinsBar.roundResult);

    if (options.showSpinsCompletedWhenExhausted && spinsExhausted) {
      const barView = this.RuntimeTryGet(IHoldAndSpinBarView);
      if (barView) {
        barView.ShowCompleted(false);
      }
    }

    if (options.showLastPhaseSpinsCompletedAnimated !== undefined && this.IsLastPhase() && spinsExhausted) {
      const barView = this.RuntimeTryGet(IHoldAndSpinBarView);
      if (barView) {
        barView.ShowCompleted(options.showLastPhaseSpinsCompletedAnimated);
      }
    }
  }

  private IsLastPhase() {
    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (!roundResult) return false;

    const phases = roundResult.GetPhases(this.GetRuntime());
    return phases.length > 0 && nvram.phaseIdx === phases.length - 1;
  }

  SetFeatureStartedViews(featureStarted: boolean) {
    const reelsOverlayView = this.RuntimeTryGet(IReelsOverlayView);
    if (reelsOverlayView) {
      reelsOverlayView.SetType(
        featureStarted ? EReelsOverlayType.HoldAndSpin
          : EReelsOverlayType.Main);
    }

    const overlayView = this.RuntimeTryGet(IHoldAndSpinRoundOverlayView);
    if (overlayView) {
      overlayView.SetHoldAndSpinBannerVisible(featureStarted);
    }

    const barView = this.RuntimeTryGet(IHoldAndSpinBarView);
    if (barView) {
      barView.SetFeatureStarted(featureStarted);
    }
  }

  private static BuildOutroHoldedGrid(stop: SymbolGrid, triggerSymbolIds: SymbolId[]): SymbolGrid {
    const holded: SymbolGrid = [];
    holded.length = stop.length;
    for (let col = 0; col < stop.length; ++col) {
      if (AssertIf(!IsValidIndex(stop, col))) continue;
      holded[col] = []; // a TypeScript array resized has holes: C++ resizes the column it has
      holded[col].length = stop[col].length;
      for (let row = 0; row < stop[col].length; ++row) {
        const sid = stop[col][row];
        holded[col][row] = Contains(triggerSymbolIds, sid) ? sid : -1;
      }
    }

    return holded;
  }

  private ApplyHoldAndSpinReelSetup(setup: HoldAndSpinReelSetup) {
    if (setup === HoldAndSpinReelSetup.None) return;

    const roundRules = this.GetRoundRules();
    const fakeReels = roundRules.GetFakeReels();

    let stop: SymbolGrid = [];
    let holded: SymbolGrid = [];

    switch (setup as HoldAndSpinReelSetup) {
      case HoldAndSpinReelSetup.Trigger:
        holded = this.GetHoldAndSpinHoldedGrid();
        stop = holded;
        break;

      case HoldAndSpinReelSetup.Spinning:
      case HoldAndSpinReelSetup.Presenting: {
        const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
        const roundResult = nvram.roundResult;
        if (AssertIf(!roundResult)) return;

        const phases = roundResult!.GetPhases(this.GetRuntime());
        if (AssertIf(!phases.length)) return;

        const phaseIdx = nvram.phaseIdx;
        if (!IsValidIndex(phases, phaseIdx)) return;

        const roundPhase = phases[phaseIdx];
        if (AssertIf(!(roundPhase instanceof HoldAndSpinPhase))) return;

        const phase = roundPhase as HoldAndSpinPhase;
        stop = phase.stop;
        holded = this.GetHoldAndSpinHoldedGrid();
        break;
      }

      case HoldAndSpinReelSetup.Outro: {
        const lastResult = this.ConstParent(IGameManager).GetLastRoundResult();
        const phases = lastResult.GetPhases(this.GetRuntime());
        if (AssertIf(!phases.length)) return;

        const lastPhase = phases[phases.length - 1];
        if (AssertIf(!(lastPhase instanceof HoldAndSpinPhase))) return;

        const phase = lastPhase as HoldAndSpinPhase;
        stop = phase.stop;
        holded = HoldAndSpinRoundState.BuildOutroHoldedGrid(stop, roundRules.GetConfig().triggerSymbolIds);
        break;
      }

      case HoldAndSpinReelSetup.None: return;
    }

    const reelsView = this.RuntimeGet(IReelsView);
    reelsView.ClearHoldAndSpinSymbols();
    reelsView.SetupFakeReels(fakeReels);

    if (setup === HoldAndSpinReelSetup.Spinning) {
      reelsView.StartReeling();
      reelsView.ShowHoldAndSpinPhase(stop, holded);
    } else {
      reelsView.ShowHoldAndSpinPhase(stop, holded);
      reelsView.ShowStopFigures();
    }
  }

  private GetHoldAndSpinHoldedGrid(): SymbolGrid {
    let result: SymbolGrid = [];
    const roundRules = this.GetRoundRules();
    const hsConfig = roundRules.GetConfig();
    const triggerSymbolIds = hsConfig.triggerSymbolIds;

    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    const prevPhaseIdx = nvram.phaseIdx - 1;

    if (roundResult) {
      const phases = roundResult.GetPhases(this.GetRuntime());

      if (IsValidIndex(phases, prevPhaseIdx)) {
        const phase = phases[prevPhaseIdx] as HoldAndSpinPhase;
        result = Copy(phase.stop);
      } else if (nvram.roundInput) {
        result = Copy(nvram.roundInput.prevStop);
      }
    } else if (nvram.roundInput) {
      result = Copy(nvram.roundInput.prevStop);
    }

    for (const reel of result) {
      for (let row = 0; row < reel.length; row++) {
        reel[row] = Contains(triggerSymbolIds, reel[row]) ? reel[row] : -1;
      }
    }

    return result;
  }

  private InitRoundInput(input: HoldAndSpinRoundInput) {
    const betManager = this.ConstParent(IBetManager);
    const holdAndSpinEnergy = this.RuntimeGetConst(IGameflow).GetMatchCurrencyAvailable(Currency.HoldAndSpinEnergy);

    input.roundType = this.GetRoundType();
    input.bet = betManager.GetInitialBet();
    input.consume = new Currencies(Currency.HoldAndSpinEnergy, input.bet);
    input.prevHoldAndSpinEnergy = holdAndSpinEnergy;
  }

  private PrepareInput(input: HoldAndSpinRoundInput) {
    const lastRoundResult = this.ConstParent(IGameManager).GetLastRoundResult();
    const lastRoundPhases = lastRoundResult.GetPhases(this.GetRuntime());
    if (AssertIf(!lastRoundPhases.length)) return;

    const lastRoundPhase = lastRoundPhases[lastRoundPhases.length - 1];
    const lastRoundInput = lastRoundResult.GetInput();

    const rules = this.GetRoundRules();
    rules.PrepareInput(input, lastRoundInput, lastRoundPhase);
  }
}

EgtALogCategoryClass(HoldAndSpinRoundState, 'HoldAndSpinRoundState');
