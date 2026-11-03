// Egt::Game::AlphaFamily::LanguageSwButtonView (BurningCrownTetraSpins10View/SwButtons/LanguageSwButtonView.h/.cpp):
// opens the language menu; its main and Tetra elements each keep their JSON position.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ELanguageSwButtonType, ILanguageSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { PanelLayout } from '../PanelLayout';
import { GameBackgroundViewToken } from '../Views/GameBackgroundView';

const LanguageSwButtonViewId = 'LanguageSwButtonView';
const ButtonLanguageId = 'button_language';

export class LanguageSwButtonView extends ButtonView implements ILanguageSwButtonView {
  private readonly m_panelLayout = new PanelLayout(this.m_elementsList);
  private m_buttonType = ELanguageSwButtonType.Normal;

  constructor() {
    super(LanguageSwButtonViewId, ILanguageSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(LanguageSwButtonViewId, () => this.ApplyPanelLayout());
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

  Draw(drawList: DrawList) {
    if (this.IsHiddenByLayout()) return;
    super.Draw(drawList);
  }

  HandleTouchDown(x: number, y: number) {
    if (this.IsHiddenByLayout()) return false;
    return super.HandleTouchDown(x, y);
  }

  SetButtonType(type: ELanguageSwButtonType) {
    if (type === this.m_buttonType) return;
    this.m_buttonType = type;
  }

  private ApplyPanelLayout() {
    this.m_panelLayout.Apply();
    this.SetToggleButtonId(this.m_panelLayout.ElementId(ButtonLanguageId));
  }

  /** The layout's JSON hides the button (Tetra's): the view draws nothing and takes no touch. */
  private IsHiddenByLayout() {
    return this.m_elementsList.IsLoaded() && !this.m_panelLayout.IsShown(this.m_buttonId);
  }
}
