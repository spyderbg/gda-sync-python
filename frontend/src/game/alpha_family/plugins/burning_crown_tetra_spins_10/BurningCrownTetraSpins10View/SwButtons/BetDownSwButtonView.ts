// Egt::Game::AlphaFamily::BetDownSwButtonView (BurningCrownTetraSpins10View/SwButtons/BetDownSwButtonView.h/.cpp): opens and closes the bet menu (it has no element of its own in this game).

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IBetDownSwButtonView } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const BetDownSwButtonViewId = 'BetDownSwButtonView';
const ButtonId = 'button_bet_down';

export class BetDownSwButtonView extends ButtonView {
  constructor() {
    super(BetDownSwButtonViewId, IBetDownSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(BetDownSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
