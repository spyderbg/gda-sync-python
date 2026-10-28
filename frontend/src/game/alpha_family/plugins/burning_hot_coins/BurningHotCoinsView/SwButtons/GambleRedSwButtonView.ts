// Egt::Game::AlphaFamily::GambleRedSwButtonView (BurningHotCoinsView/SwButtons/GambleRedSwButtonView.h/.cpp): gambles on red.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IGambleRedSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const GambleRedSwButtonViewId = 'GambleRedSwButtonView';

const ButtonGambleRedId = 'button_gamble_red';

export class GambleRedSwButtonView extends ButtonView {
  constructor() {
    super(GambleRedSwButtonViewId, IGambleRedSwButtonView, new IButtonViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(GambleRedSwButtonViewId, () => {
      this.SetButtonId(ButtonGambleRedId);
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
