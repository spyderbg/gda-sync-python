// Egt::Game::AlphaFamily::ResponsibleSwButtonView (ZodiacWheelCoinsView/SwButtons/ResponsibleSwButtonView.h/.cpp): opens the responsible gaming setup.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IResponsibleSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const ResponsibleSwButtonViewId = 'ResponsibleSwButtonView';

const ButtonResponsibleGamingId = 'button_responsible_gaming';

export class ResponsibleSwButtonView extends ButtonView {
  constructor() {
    super(ResponsibleSwButtonViewId, IResponsibleSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(ResponsibleSwButtonViewId, () => {
      this.SetButtonId(ButtonResponsibleGamingId);
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
