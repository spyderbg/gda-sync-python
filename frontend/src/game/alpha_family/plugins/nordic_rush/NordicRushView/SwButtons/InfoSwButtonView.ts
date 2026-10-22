// Egt::Game::AlphaFamily::InfoSwButtonView (NordicRushView/SwButtons/InfoSwButtonView.h/.cpp): shows the next help page.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IInfoSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

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
