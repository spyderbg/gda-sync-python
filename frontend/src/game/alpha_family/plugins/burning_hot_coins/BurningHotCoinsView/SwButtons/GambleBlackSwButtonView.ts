// Egt::Game::AlphaFamily::GambleBlackSwButtonView (BurningHotCoinsView/SwButtons/GambleBlackSwButtonView.h/.cpp): gambles on black.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IGambleBlackSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const GambleBlackSwButtonViewId = 'GambleBlackSwButtonView';

const ButtonGambleBlackId = 'button_gamble_black';

export class GambleBlackSwButtonView extends ButtonView {
  constructor() {
    super(GambleBlackSwButtonViewId, IGambleBlackSwButtonView, new IButtonViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(GambleBlackSwButtonViewId, () => {
      this.SetButtonId(ButtonGambleBlackId);
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
