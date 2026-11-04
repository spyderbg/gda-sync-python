// Egt::Game::AlphaFamily::LanguageSwButtonView (BurningCrownTetraSpins10View/SwButtons/LanguageSwButtonView.h/.cpp):
// opens the language menu; its main and Tetra elements each keep their JSON position.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ILanguageSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { ThemeLayout } from '../ThemeLayout';

const LanguageSwButtonViewId = 'LanguageSwButtonView';
const ButtonLanguageId = 'button_language';

export class LanguageSwButtonView extends ButtonView implements ILanguageSwButtonView {
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

  constructor() {
    super(LanguageSwButtonViewId, ILanguageSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(LanguageSwButtonViewId);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (this.IsHiddenByTheme()) return;
    super.Draw(drawList);
  }

  HandleTouchDown(x: number, y: number) {
    if (this.IsHiddenByTheme()) return false;
    return super.HandleTouchDown(x, y);
  }

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
    this.SetToggleButtonId(this.m_themeLayout.ElementId(ButtonLanguageId));
  }

  /** The theme's JSON hides the button (Tetra's): the view draws nothing and takes no touch. */
  private IsHiddenByTheme() {
    return this.m_elementsList.IsLoaded() && !this.m_themeLayout.IsShown(this.m_buttonId);
  }
}
