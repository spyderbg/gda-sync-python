// Egt::Game::AlphaFamily::BetUpSwButtonView (BurningCrownTetraSpins10View/SwButtons/BetUpSwButtonView.h/.cpp): opens and closes the bet menu.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IBetUpSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { PanelLayout } from '../PanelLayout';
import { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';

const BetUpSwButtonViewId = 'BetUpSwButtonView';
const ButtonId = 'button_bet_up';

export class BetUpSwButtonView extends ButtonView {
  private readonly m_panelLayout = new PanelLayout(this.m_elementsList);

  constructor() {
    super(BetUpSwButtonViewId, IBetUpSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(BetUpSwButtonViewId, () => this.ApplyPanelLayout());
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    if (this.m_panelLayout.Update(this.RuntimeTryGetConst(IGameBackgroundView)) && this.m_elementsList.IsLoaded()) {
      this.ApplyPanelLayout();
    }
  }

  private ApplyPanelLayout() {
    this.m_panelLayout.Apply();
    this.SetButtonId(this.m_panelLayout.ElementId(ButtonId));
  }
}
