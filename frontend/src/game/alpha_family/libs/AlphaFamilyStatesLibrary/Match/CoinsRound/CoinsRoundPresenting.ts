// Egt::Game::AlphaFamily::CoinsRoundPresentingState (AlphaFamilyStatesLibrary/Match/CoinsRound/CoinsRoundPresenting):
// START blinks while the round's wins are presented.

import { HwButtonLight, IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import { ICoinsRoundEnding, ICoinsRoundPresenting } from '@game/alpha_family/libs/AlphaFamily/States/Match/ICoinsRound';
import { ReelRoundPresentingState } from '../ReelRound/ReelRoundPresenting';

export class CoinsRoundPresentingState extends ReelRoundPresentingState {
  static Interfaces = [ICoinsRoundPresenting, ...ReelRoundPresentingState.Interfaces];

  ToRoundEnding() {
    return this.Transit(ICoinsRoundEnding);
  }

  protected RefreshHWButtons(enable: boolean) {
    super.RefreshHWButtons(enable);

    this.RuntimeGet(IStartHwButton).SetButtonState({ enabled: enable, light: HwButtonLight.BlinkSlowA });
  }
}

EgtALogCategoryClass(CoinsRoundPresentingState, 'CoinsRoundPresentingState');
