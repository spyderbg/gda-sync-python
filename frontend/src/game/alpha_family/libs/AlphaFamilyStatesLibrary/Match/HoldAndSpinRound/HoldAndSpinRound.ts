// Egt::Game::AlphaFamily::HoldAndSpinRoundState (AlphaFamilyStatesLibrary/Match/HoldAndSpinRound/HoldAndSpinRound): a
// hold and spin round, which consumes HoldAndSpinEnergy; its input follows the reel round that triggered it.

import { State } from '@game/engine/Fsm/Fsm';
import { Currencies } from '@game/engine/Game/Math/Common.data';
import { Contains, IsValidIndex } from '@game/engine/GameCore/Common/ContainerHelpers';
import { AssertIf } from '@game/engine/GameCore/Common/Defensive';
import { Copy } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType, type SymbolGrid } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { HoldAndSpinRoundInput } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundInput.data';
import { HoldAndSpinPhase } from '@game/alpha_family/libs/AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IBetManager } from '@game/alpha_family/libs/AlphaFamily/States/IBetManager';
import { IGameManager } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager, type SetupViewsOptions } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { type HoldAndSpinViewOptions, IHoldAndSpinRound } from '@game/alpha_family/libs/AlphaFamily/States/Match/IHoldAndSpinRound';
import { IHoldAndSpinRoundInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundInfoView.bridge';
import { EReelsOverlayType, IReelsOverlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsOverlayView.bridge';
import { IReelsView } from '@game/alpha_family/libs/AlphaFamily/Views/IReelsView.bridge';
import { HoldAndSpinRoundStorage } from './HoldAndSpinRound.data';

export class HoldAndSpinRoundState extends State implements IHoldAndSpinRound {
  static Interfaces = [IHoldAndSpinRound];
  static Nvrams = [HoldAndSpinRoundStorage];

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
      overrideWinBar: options.overrideWinBar,
      disableInfoButton: options.disableInfoButton ?? false,
      overrideSpecialRoundView: RoundType.HoldAndSpin,
    };

    if (options.startReeling) {
      vmOptions.overrideFakeReels = RoundType.HoldAndSpin;
    }

    if (options.setupHoldAndSpinReels) {
      this.SetupHoldAndSpinReelsView();
    }

    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    if (nvram.roundResult) {
      this.Parent(IViewManager).SetupViews(nvram.roundResult, vmOptions);
    } else {
      this.Parent(IViewManager).SetupViewsLastResult(vmOptions);
    }

    if (options.showMainInfo) {
      this.RuntimeGet(IHoldAndSpinRoundInfoView).ShowMain();
    }

    const reelsOverlayView = this.RuntimeTryGet(IReelsOverlayView);
    if (reelsOverlayView) {
      reelsOverlayView.SetType(EReelsOverlayType.HoldAndSpin);
    }
  }

  private SetupHoldAndSpinReelsView() {
    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (AssertIf(!roundResult)) return;

    const phases = roundResult!.GetPhases(this.GetRuntime());
    if (AssertIf(!phases.length)) return;

    const phaseIdx = nvram.phaseIdx;
    if (!IsValidIndex(phases, phaseIdx)) return;

    const roundPhase = phases[phaseIdx];
    if (AssertIf(!(roundPhase instanceof HoldAndSpinPhase))) return;

    const roundRules = this.GetRoundRules();
    const fakeReels = roundRules.GetFakeReels();

    const phase = roundPhase as HoldAndSpinPhase;
    const stop = phase.stop;
    const holded = this.GetHoldAndSpinHoldedGrid();

    const reelsView = this.RuntimeGet(IReelsView);
    reelsView.SetupFakeReels(fakeReels);
    reelsView.StartReeling();
    reelsView.ShowHoldAndSpinPhase(stop, holded);
  }

  private GetHoldAndSpinHoldedGrid(): SymbolGrid {
    let result: SymbolGrid = [];
    const roundRules = this.GetRoundRules();
    const hsConfig = roundRules.GetConfig();
    const triggerSymbolIds = hsConfig.triggerSymbolIds;

    const nvram = this.ConstNvram(HoldAndSpinRoundStorage);
    const roundResult = nvram.roundResult;
    if (AssertIf(!roundResult)) return result;

    const phases = roundResult!.GetPhases(this.GetRuntime());
    const prevPhaseIdx = nvram.phaseIdx - 1;

    if (IsValidIndex(phases, prevPhaseIdx)) {
      const phase = phases[prevPhaseIdx] as HoldAndSpinPhase;
      result = Copy(phase.stop);
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
