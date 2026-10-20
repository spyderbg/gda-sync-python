// Egt::Game::AlphaFamily::LineUpSwButtonView (BurningCrownTetraSpins10View/SwButtons/LineUpSwButtonView.h/.cpp): more lines (BurningCrownTetraSpins10 has fixed lines and no element for it).

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ILineUpSwButtonView } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

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
