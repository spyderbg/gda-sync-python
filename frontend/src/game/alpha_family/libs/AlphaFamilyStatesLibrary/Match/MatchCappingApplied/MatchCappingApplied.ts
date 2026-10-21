// Egt::Game::AlphaFamily::MatchCappingAppliedState (AlphaFamilyStatesLibrary/Match/MatchCappingApplied): the match won
// the maximum award. The capping splash shows until its idle time passes, then the match ends, taxed if it must be.

import { State } from '@game/engine/Fsm/Fsm';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICreditTaxation } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICreditTaxation';
import { IMatchCappingApplied } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchCappingApplied';
import { IMatchEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEnding';
import { ICappingSplashView } from '@game/alpha_family/libs/AlphaFamily/Views/ICappingSplashView.bridge';

export class MatchCappingAppliedState extends State {
  static Interfaces = [IMatchCappingApplied];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();
    this.RefreshViews();

    const showAllFeaturesEnd = this.RuntimeGetConst(IGameflow).HasRemainingFeaturesOnCap();
    this.RuntimeGet(ICappingSplashView).ShowCappingSplashView(showAllFeaturesEnd);
  }

  private AttachCallbacks() {
    // Dismiss the Capping Splash on time out even from the View
    this.ReactOn(this.RuntimeGetConst(ICappingSplashView.Events).splashIdleDismissed, this.CloseSplash);
  }

  private RefreshViews() {
    this.Parent(IViewManager).SetupViews(RoundType.Main, { blockGameInput: true, pauseWinAnimations: true, playAnimationFromLoop: true });
  }

  private CloseSplash() {
    this.RuntimeGet(ICappingSplashView).HideCappingSplashView();

    if (this.CheckForTax()) {
      return this.Transit(ICreditTaxation);
    }

    return this.Transit(IMatchEnding);
  }

  private CheckForTax() {
    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    const credits = available.Get(Currency.Credits);

    const limits = this.RuntimeTryGetConst(ILimits);

    return limits!.IsTaxThresholdBreached(credits);
  }
}

EgtALogCategoryClass(MatchCappingAppliedState, 'MatchCappingAppliedState');
