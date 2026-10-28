// Egt::Game::AlphaFamily::LineUpSwButtonView (BurningHotCoinsView/SwButtons/LineUpSwButtonView.h/.cpp): more lines (BurningHotCoins has fixed lines and no element for it).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ILineUpSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const LineUpSwButtonViewId = 'LineUpSwButtonView';
const ButtonId = 'button_line_up';

export class LineUpSwButtonView extends ButtonView {
  constructor() {
    super(LineUpSwButtonViewId, ILineUpSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(LineUpSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
