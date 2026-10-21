// Egt::Game::AlphaFamily::LineDownSwButtonView (BurningCrownTetraSpins10View/SwButtons/LineDownSwButtonView.h/.cpp): fewer lines (BurningCrownTetraSpins10 has fixed lines and no element for it).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ILineDownSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const LineDownSwButtonViewId = 'LineDownSwButtonView';
const ButtonId = 'button_line_down';

export class LineDownSwButtonView extends ButtonView {
  constructor() {
    super(LineDownSwButtonViewId, ILineDownSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(LineDownSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
