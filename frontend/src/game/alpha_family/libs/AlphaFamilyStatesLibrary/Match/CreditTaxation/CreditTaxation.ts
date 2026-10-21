// Egt::Game::AlphaFamily::CreditTaxationState (AlphaFamilyStatesLibrary/Match/CreditTaxation): shows the tax message
// of a win over the jurisdiction's threshold, until it is closed.

import { State } from '@game/engine/Fsm/Fsm';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { GameManagerNvrams } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICreditTaxation } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICreditTaxation';
import { IMatchEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEnding';

export class CreditTaxationState extends State {
  static Interfaces = [ICreditTaxation];

  OnTransit() {
    this.ReactOn(this.RuntimeGetConst(IStartHwButton.Events).buttonPressedEvent, this.OnStartButtonPressed);
    this.ReactOn(this.RuntimeGetConst(ILimits.Events).taxMessageClosed, this.OnTaxationClosed);
    this.Nvram(GameManagerNvrams).taxedWin = false;
    const credits = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable().Get(Currency.Credits);
    this.Parent(IViewManager).SetupViews(RoundType.Main, {
      enableButtons: false, overrideWinBar: credits, disableInfoButton: true, pauseWinAnimations: true, playAnimationFromLoop: true, changeCreditBar: false,
    });
    this.RuntimeTryGet(ILimits)?.ShowTaxMessage(credits);
  }

  OnStartButtonPressed() {
    this.RuntimeTryGet(ILimits)?.CloseTaxMessage();
    return this.Forward();
  }

  OnTaxationClosed() {
    this.Nvram(GameManagerNvrams).taxedWin = true;
    return this.Transit(IMatchEnding);
  }
}
