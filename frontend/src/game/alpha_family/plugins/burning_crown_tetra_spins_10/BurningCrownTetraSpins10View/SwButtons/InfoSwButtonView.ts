// Egt::Game::AlphaFamily::InfoSwButtonView (BurningCrownTetraSpins10View/SwButtons/InfoSwButtonView.h/.cpp): shows the next help page.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IInfoSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { ThemeLayout } from '../ThemeLayout';

const InfoSwButtonViewId = 'InfoSwButtonView';
const ButtonInfoId = 'button_info';

export class InfoSwButtonView extends ButtonView {
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

  constructor() {
    super(InfoSwButtonViewId, IInfoSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(InfoSwButtonViewId);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
    this.SetButtonId(this.m_themeLayout.ElementId(ButtonInfoId));
  }
}
