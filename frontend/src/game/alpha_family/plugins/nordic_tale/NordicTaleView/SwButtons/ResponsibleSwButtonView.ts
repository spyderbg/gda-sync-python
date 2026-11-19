// Egt::Game::AlphaFamily::ResponsibleSwButtonView (NordicTaleView/SwButtons/ResponsibleSwButtonView.h/.cpp): opens the responsible gaming setup, when
// its view has the button (this game's has none).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
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
      if (this.m_elementsList.Find(ButtonResponsibleGamingId, ButtonElement)) {
        this.SetButtonId(ButtonResponsibleGamingId);
      }
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
