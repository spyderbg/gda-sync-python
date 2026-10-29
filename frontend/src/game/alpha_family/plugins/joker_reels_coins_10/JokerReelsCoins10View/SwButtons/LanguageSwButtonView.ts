// Egt::Game::AlphaFamily::LanguageSwButtonView (JokerReelsCoins10View/SwButtons/LanguageSwButtonView.h/.cpp): opens the
// language menu.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { type ELanguageSwButtonType, ILanguageSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const LanguageSwButtonViewId = 'LanguageSwButtonView';

const ButtonLanguageId = 'button_language';

export class LanguageSwButtonView extends ButtonView implements ILanguageSwButtonView {
  constructor() {
    super(LanguageSwButtonViewId, ILanguageSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(LanguageSwButtonViewId, () => {
      this.SetToggleButtonId(ButtonLanguageId);
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  SetButtonType(_type: ELanguageSwButtonType) {}
}
