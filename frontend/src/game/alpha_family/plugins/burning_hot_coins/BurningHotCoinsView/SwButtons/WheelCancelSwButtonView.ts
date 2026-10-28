// Egt::Game::AlphaFamily::WheelCancelSwButtonView (BurningHotCoinsView/SwButtons/WheelCancelSwButtonView.h/.cpp): cancels the coins wheel.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IWheelCancelSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const WheelCancelSwButtonViewId = 'WheelCancelSwButtonView';

const ButtonWheelCancelId = 'button_wheel_cancel';

export class WheelCancelSwButtonView extends ButtonView {
  constructor() {
    super(WheelCancelSwButtonViewId, IWheelCancelSwButtonView, new IButtonViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(WheelCancelSwButtonViewId, () => {
      this.SetButtonId(ButtonWheelCancelId);
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
