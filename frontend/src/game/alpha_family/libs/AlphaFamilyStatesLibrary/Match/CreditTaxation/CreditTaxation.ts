// Egt::Game::AlphaFamily::CreditTaxationState (AlphaFamilyStatesLibrary/Match/CreditTaxation): shows the tax message
// of a win over the jurisdiction's threshold, until it is closed.

import { State } from '@game/engine/Fsm/Fsm';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import { IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { ILimits } from '@game/engine/Game/RuntimeImport/ILimits';
import { EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { Currency, RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IGameflow } from '@game/alpha_family/libs/AlphaFamily/RuntimeImport/IGameflow.bridge';
import { GameManagerNvrams } from '@game/alpha_family/libs/AlphaFamily/States/IGameManager';
import { IViewManager } from '@game/alpha_family/libs/AlphaFamily/States/IViewManager';
import { ICreditTaxation } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICreditTaxation';
import { IMatchEnding } from '@game/alpha_family/libs/AlphaFamily/States/Match/IMatchEnding';

export class CreditTaxationState extends State {
  static Interfaces = [ICreditTaxation];

  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

    this.AttachCallbacks();

    this.Nvram(GameManagerNvrams).taxedWin = false;

    const available = this.RuntimeGetConst(IGameflow).GetMatchCurrenciesAvailable();
    const credits = available.Get(Currency.Credits);

    this.Parent(IViewManager).SetupViews(RoundType.Main, {
      enableButtons: false,
      overrideWinBar: credits,
      disableInfoButton: true,
      pauseWinAnimations: true,
      playAnimationFromLoop: true,
      changeCreditBar: false,
    });

    const limits = this.RuntimeTryGet(ILimits);
    if (Unless(limits)) return;

    limits.ShowTaxMessage(credits);
  }

  private AttachCallbacks() {
    const startButtonEvents = this.RuntimeTryGetConst(IStartHwButton.Events);
    if (startButtonEvents) {
      this.ReactOn(startButtonEvents.buttonPressedEvent, this.OnStartButtonPressed);
    }

    const limitEvents = this.RuntimeTryGetConst(ILimits.Events);
    if (limitEvents) {
      this.ReactOn(limitEvents.taxMessageClosed, this.OnTaxationClosed);
    }
  }

  OnStartButtonPressed() {
    const limits = this.RuntimeTryGet(ILimits);
    if (Unless(limits)) return this.Forward();

    limits.CloseTaxMessage();

    return this.Forward();
  }

  OnTaxationClosed() {
    this.Nvram(GameManagerNvrams).taxedWin = true;

    return this.Transit(IMatchEnding);
  }
}

EgtALogCategoryClass(CreditTaxationState, 'CreditTaxationState');
