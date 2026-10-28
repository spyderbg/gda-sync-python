// Egt::Game::AlphaFamily::WheelStartSwButtonView (BurningHotCoinsView/SwButtons/WheelStartSwButtonView.h/.cpp): starts
// the coins wheel; any of its touch areas (two squares and the circle) presses it.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { IWheelStartSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const WheelStartSwButtonViewId = 'WheelStartSwButtonView';

const ButtonSquare1Id = 'button_square_1';
const ButtonSquare2Id = 'button_square_2';
const ButtonCircle1Id = 'button_circle_1';

enum EState {
  Idle = 0,
  Pressed,
  Disabled,
  Count,
}

export class WheelStartSwButtonView extends ButtonView {
  private m_state = EState.Idle;

  constructor() {
    super(WheelStartSwButtonViewId, IWheelStartSwButtonView, new IButtonViewEvents());
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(WheelStartSwButtonViewId);

    this.SetEnabled(false);

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  HandleTouchDown(x: number, y: number) {
    if (!this.m_elementsList.IsLoaded()) return false;
    if (this.m_state === EState.Disabled) return false;

    this.m_state = EState.Idle;

    for (const touchAreaId of [ButtonSquare1Id, ButtonSquare2Id, ButtonCircle1Id]) {
      const touchArea = this.m_elementsList.Get(touchAreaId, ButtonElement);
      if (touchArea.HandleTouchDown({ x, y })) {
        this.m_state = EState.Pressed;
        this.PlayButtonAudioState('down');
        this.SimulateButtonPress();
        return true;
      }
    }

    return false;
  }

  HandleTouchUp(x: number, y: number) {
    if (!this.m_elementsList.IsLoaded()) return false;
    if (this.m_state === EState.Disabled) return false;

    this.m_state = EState.Idle;

    for (const touchAreaId of [ButtonSquare1Id, ButtonSquare2Id, ButtonCircle1Id]) {
      const touchArea = this.m_elementsList.Get(touchAreaId, ButtonElement);
      if (touchArea.HandleTouchUp({ x, y })) {
        return true;
      }
    }

    return false;
  }

  SetEnabled(enabled: boolean) {
    this.m_state = enabled ? EState.Idle : EState.Disabled;
  }
}
