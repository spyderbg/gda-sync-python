// Egt::Game::AlphaFamily::ExitTetraSwButtonView (BurningCrownTetraSpins10View/SwButtons/ExitTetraSwButtonView.h/.cpp): COLLECT: ends the tetra round.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IExitTetraSwButtonView } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const ExitTetraSwButtonViewId = 'ExitTetraSwButtonView';
const ButtonId = 'tetra_collect_button';

export class ExitTetraSwButtonView extends ButtonView {
  constructor() {
    super(ExitTetraSwButtonViewId, IExitTetraSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(ExitTetraSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
