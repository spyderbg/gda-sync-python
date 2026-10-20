// Egt::Game::AlphaFamily::BetUpSwButtonView (BurningCrownTetraSpins10View/SwButtons/BetUpSwButtonView.h/.cpp): opens and closes the bet menu.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IBetUpSwButtonView } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const BetUpSwButtonViewId = 'BetUpSwButtonView';
const ButtonId = 'button_bet_up';

export class BetUpSwButtonView extends ButtonView {
  constructor() {
    super(BetUpSwButtonViewId, IBetUpSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(BetUpSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
