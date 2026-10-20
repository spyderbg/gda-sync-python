// Egt::Game::AlphaFamily::MatchCappingAppliedState (AlphaFamilyStatesLibrary/Match/MatchCappingApplied): the match won
// the maximum award. The capping splash shows until its idle time passes, then the match ends, taxed if it must be.

import { State } from '../../../../../engine/Fsm/Fsm';
import { ILimits } from '../../../../../engine/Game/RuntimeImport/ILimits';
import { Currency, RoundType } from '../../../AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '../../../AlphaFamily/RuntimeImport/IGameflow.bridge';
import { IViewManager } from '../../../AlphaFamily/States/IViewManager';
import { ICreditTaxation } from '../../../AlphaFamily/States/Match/ICreditTaxation';
import { IMatchCappingApplied } from '../../../AlphaFamily/States/Match/IMatchCappingApplied';
import { IMatchEnding } from '../../../AlphaFamily/States/Match/IMatchEnding';
import { ICappingSplashView } from '../../../AlphaFamily/Views/ICappingSplashView.bridge';

export class MatchCappingAppliedState extends State {
  static Interfaces = [IMatchCappingApplied];

  OnTransit() {
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
    if (this.CheckForTax()) return this.Transit(ICreditTaxation);
    return this.Transit(IMatchEnding);
  }

  private CheckForTax() {
    const credits = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable().Get(Currency.Credits);
    return this.RuntimeTryGetConst(ILimits)?.IsTaxThresholdBreached(credits) ?? false;
  }
}
