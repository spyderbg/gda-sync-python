// Egt::Game::AlphaFamily::BetUpSwButtonView (BurningCrownTetraSpins10View/SwButtons/BetUpSwButtonView.h/.cpp): opens and closes the bet menu.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IBetUpSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { ThemeLayout } from '../ThemeLayout';

const BetUpSwButtonViewId = 'BetUpSwButtonView';
const ButtonBetUpId = 'button_bet_up';

export class BetUpSwButtonView extends ButtonView {
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

  constructor() {
    super(BetUpSwButtonViewId, IBetUpSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(BetUpSwButtonViewId);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
    this.SetButtonId(this.m_themeLayout.ElementId(ButtonBetUpId));
  }
}
