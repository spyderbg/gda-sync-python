// Egt::Game::AlphaFamily::LanguageSwButtonView (BurningCrownTetraSpins10View/SwButtons/LanguageSwButtonView.h/.cpp):
// opens the language menu; it moves to its tetra place in the tetra round.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { BaseElement } from '../../../../../engine/GameVideoCtrl/ViewElements/BaseElement';
import { IButtonViewEvents } from '../../../../libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ELanguageSwButtonType, ILanguageSwButtonView } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const LanguageSwButtonViewId = 'LanguageSwButtonView';
const ButtonLanguageId = 'button_language';
const DummyNormalButtonId = 'dummy_normal_button';
const DummyTetraButtonId = 'dummy_tetra_button';

export class LanguageSwButtonView extends ButtonView implements ILanguageSwButtonView {
  private m_buttonType = ELanguageSwButtonType.Normal;

  constructor() {
    super(LanguageSwButtonViewId, ILanguageSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(LanguageSwButtonViewId, () => {
      this.SetToggleButtonId(ButtonLanguageId);
      this.OnElementsListLoaded();
    });
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  SetButtonType(type: ELanguageSwButtonType) {
    if (type === this.m_buttonType) return;
    this.m_buttonType = type;
    this.AdjustPosition();
  }

  private AdjustPosition() {
    if (!this.m_elementsList.IsLoaded()) return;
    switch (this.m_buttonType) {
      case ELanguageSwButtonType.Normal: {
        const dummyNormal = this.m_elementsList.TryGet(DummyNormalButtonId, BaseElement);
        if (!dummyNormal) return;
        this.m_elementsList.SetPosition(dummyNormal.GetPosition(), ButtonLanguageId);
        break;
      }
      case ELanguageSwButtonType.Tetra: {
        const dummyTetra = this.m_elementsList.TryGet(DummyTetraButtonId, BaseElement);
        if (!dummyTetra) return;
        this.m_elementsList.SetPosition(dummyTetra.GetPosition(), ButtonLanguageId);
        break;
      }
    }
  }

  private OnElementsListLoaded() {
    this.AdjustPosition();
  }
}
