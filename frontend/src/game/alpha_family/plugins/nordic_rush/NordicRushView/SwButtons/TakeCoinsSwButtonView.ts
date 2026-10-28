// Egt::Game::AlphaFamily::TakeCoinsSwButtonView (NordicRushView/SwButtons/TakeCoinsSwButtonView.h/.cpp): takes
// the coins round's coins (to the coins wheel); its disabled image shows while it is disabled.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const TakeCoinsSwButtonViewId = 'TakeCoinsSwButtonView';

const ButtonTakeCoinsId = 'button_take_coins';
const ImageButtonDisabledId = 'image_button_disabled';

export class TakeCoinsSwButtonView extends ButtonView implements ITakeCoinsSwButtonView {
  constructor() {
    super(TakeCoinsSwButtonViewId, ITakeCoinsSwButtonView, new IButtonViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(TakeCoinsSwButtonViewId, () => {
      this.SetButtonId(ButtonTakeCoinsId);
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  OnElementsListLoaded() {
    this.AdjustVisibility();
  }

  EnableButtonSkin(enable: boolean) {
    this.SetEnabled(enable);
    this.AdjustVisibility();
  }

  private AdjustVisibility() {
    const buttonElement = this.m_elementsList.TryGet(ButtonTakeCoinsId, ButtonElement);
    if (buttonElement) {
      buttonElement.SetHidden(!this.m_control.m_enabled);
      buttonElement.SetEnabled(this.m_control.m_enabled);
    }

    const imageDisabled = this.m_elementsList.TryGet(ImageButtonDisabledId, ImageElement);
    if (imageDisabled) {
      imageDisabled.SetHidden(this.m_control.m_enabled);
    }
  }
}
