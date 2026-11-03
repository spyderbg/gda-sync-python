// Egt::Game::AlphaFamily::LanguageSwButtonView (BurningCrownTetraSpins10View/SwButtons/LanguageSwButtonView.h/.cpp):
// opens the language menu; its main and Tetra elements each keep their JSON position.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ELanguageSwButtonType, ILanguageSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { PanelElementsList } from '../PanelElementsList';

const LanguageSwButtonViewId = 'LanguageSwButtonView';
const ButtonLanguageId = 'button_language';

export class LanguageSwButtonView extends ButtonView implements ILanguageSwButtonView {
  protected readonly m_elementsList = new PanelElementsList();
  private m_buttonType = ELanguageSwButtonType.Normal;

  constructor() {
    super(LanguageSwButtonViewId, ILanguageSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(LanguageSwButtonViewId, () => this.SetToggleButtonId(ButtonLanguageId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  SetButtonType(type: ELanguageSwButtonType) {
    if (type === this.m_buttonType) return;
    this.m_buttonType = type;
    this.ReloadElementsList();
  }
}
