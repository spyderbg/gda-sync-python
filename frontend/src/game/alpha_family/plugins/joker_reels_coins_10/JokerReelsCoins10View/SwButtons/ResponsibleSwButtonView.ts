// Egt::Game::AlphaFamily::ResponsibleSwButtonView (JokerReelsCoins10View/SwButtons/ResponsibleSwButtonView.h/.cpp): opens the responsible gaming setup (no element in this game).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IResponsibleSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const ResponsibleSwButtonViewId = 'ResponsibleSwButtonView';
const ButtonId = 'button_responsible';

export class ResponsibleSwButtonView extends ButtonView {
  constructor() {
    super(ResponsibleSwButtonViewId, IResponsibleSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(ResponsibleSwButtonViewId, () => this.SetButtonId(ButtonId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }
}
