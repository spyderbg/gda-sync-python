// Egt::Game::AlphaFamily::InfoSwButtonView (BurningCrownTetraSpins10View/SwButtons/InfoSwButtonView.h/.cpp): shows the next help page.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IInfoSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { PanelLayout } from '../PanelLayout';
import { GameBackgroundViewToken } from '../Views/GameBackgroundView';

const InfoSwButtonViewId = 'InfoSwButtonView';
const ButtonId = 'button_info';

export class InfoSwButtonView extends ButtonView {
  private readonly m_panelLayout = new PanelLayout(this.m_elementsList);

  constructor() {
    super(InfoSwButtonViewId, IInfoSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(InfoSwButtonViewId, () => this.ApplyPanelLayout());
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    if (this.m_panelLayout.Update(this.RuntimeTryGetConst(GameBackgroundViewToken)) && this.m_elementsList.IsLoaded()) {
      this.ApplyPanelLayout();
    }
  }

  private ApplyPanelLayout() {
    this.m_panelLayout.Apply();
    this.SetButtonId(this.m_panelLayout.ElementId(ButtonId));
  }
}
