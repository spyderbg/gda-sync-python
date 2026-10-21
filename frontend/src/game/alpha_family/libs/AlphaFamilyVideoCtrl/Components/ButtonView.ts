// Egt::Game::AlphaFamily::ButtonView (AlphaFamilyVideoCtrl/Components/ButtonView.h): a software button view, whose
// button element (SetButtonId, or SetToggleButtonId for a toggle button) takes the touches: a touch down on it presses
// the button (SimulateButtonPress), which posts buttonPressedEvent, as the game's own presses do.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { ToggleButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ToggleButtonElement';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { ISwButtonBase, SwButtonToken } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { BaseView } from '../BaseView';

export class ButtonView<E extends IButtonViewEvents = IButtonViewEvents> extends BaseView implements ISwButtonBase {
  protected m_blinking = false;
  protected m_buttonId = '';

  // C++: ButtonView<Interface>(name, label), whose Interface and Events are the token's
  constructor(name: string, protected readonly m_token: SwButtonToken<ISwButtonBase, E>, protected readonly m_events: E) {
    super(name);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(this.m_token, this);
    this.RuntimeAdd(this.m_token.Events, this.m_events);
    this.SetSkin('default');
    return true;
  }

  Deinit() {
    this.RuntimeRemove(this.m_token);
    this.RuntimeRemove(this.m_token.Events);
    super.Deinit();
  }

  HandleTouchDown(x: number, y: number) {
    if (!this.m_elementsList.IsLoaded()) return false;
    if (!this.m_buttonId) return false;
    const captured = this.m_elementsList.Get(this.m_buttonId, BaseElement).HandleTouchDown({ x, y });
    if (captured) this.SimulateButtonPress();
    return captured;
  }

  HandleTouchUp(x: number, y: number) {
    if (!this.m_elementsList.IsLoaded()) return false;
    if (!this.m_buttonId) return false;
    return this.m_elementsList.Get(this.m_buttonId, BaseElement).HandleTouchUp({ x, y });
  }

  // IControlView

  SetEnabled(enabled: boolean) {
    if (this.IsEnabled() !== enabled) {
      super.SetEnabled(enabled);
      if (this.m_buttonId) {
        const element = this.m_elementsList.TryGet(this.m_buttonId, ButtonElement);
        if (element) element.SetEnabled(enabled);
        else this.m_elementsList.Get(this.m_buttonId, ToggleButtonElement).SetEnabled(enabled);
      }
    }
  }

  SetVisible(visible: boolean) {
    if (this.IsVisible() !== visible) {
      super.SetVisible(visible);
      if (this.m_buttonId) this.m_elementsList.Get(this.m_buttonId, BaseElement).SetHidden(!visible);
    }
  }

  SetFocused(focused: boolean) {
    if (this.IsFocused() !== focused) super.SetFocused(focused);
  }

  SetSkin(skin: string) {
    super.SetSkin(skin);
  }

  // IButtonView

  SimulateButtonPress() {
    if (!this.IsEnabled()) return;
    this.m_events.buttonPressedEvent.Post();
  }

  SetBlinking(blinking: boolean) {
    this.m_blinking = blinking;
  }

  PlayButtonAudioState(_audioStateName: string) {}

  ResetButtonState() {
    const button = this.m_elementsList.TryGet(this.m_buttonId, ToggleButtonElement);
    if (button) button.ResetState();
  }

  // ISwButtonBase::SetButtonState, which C++ defines in the interface
  SetButtonState(isEnabled: boolean, isFocused = false, skin = '', isBlinking = false) {
    this.SetEnabled(isEnabled);
    this.SetFocused(isFocused);
    this.SetSkin(skin);
    this.SetBlinking(isBlinking);
  }

  protected SetButtonId(buttonId: string) {
    if (!this.m_elementsList.Find(buttonId, ButtonElement)) return;
    this.m_buttonId = buttonId;
    const button = this.m_elementsList.Get(this.m_buttonId, ButtonElement);
    button.SetEnabled(super.IsEnabled());
    button.SetHidden(!super.IsVisible());
  }

  protected SetToggleButtonId(buttonId: string) {
    if (!this.m_elementsList.Find(buttonId, ToggleButtonElement)) return;
    this.m_buttonId = buttonId;
    const button = this.m_elementsList.Get(this.m_buttonId, ToggleButtonElement);
    button.SetEnabled(super.IsEnabled());
    button.SetHidden(!super.IsVisible());
  }
}
