// Egt::Game::AlphaFamily::InfoSwButtonView (BurningCrownTetraSpins10View/SwButtons/InfoSwButtonView.h/.cpp): shows the next help page.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IInfoSwButtonView } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const InfoSwButtonViewId = 'InfoSwButtonView';
const ButtonId = 'button_info';

export class InfoSwButtonView extends ButtonView {
  constructor() {
    super(InfoSwButtonViewId, IInfoSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(InfoSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
