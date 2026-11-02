// Egt::Game::AlphaFamily::Stub::StubSwButton<Interface> (AlphaFamilyAutomationView/Components/StubSwButton.h): a stub of
// a software button, which is pressed only while enabled.

import type { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { ISwButtonBase } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubControl } from './StubControl';

export abstract class StubSwButton<Interface extends ISwButtonBase = ISwButtonBase, Events extends IButtonViewEvents = IButtonViewEvents>
  extends StubControl<Interface, Events> implements ISwButtonBase {
  ////////////////////////////////////////////////////////////////////////////////
  /// ISwButton
  ////////////////////////////////////////////////////////////////////////////////

  SetBlinking(_blinking: boolean) {}

  SimulateButtonPress() {
    if (!this.m_enabled) return;
    this.m_events!.buttonPressedEvent.Post();
  }

  PlayButtonAudioState(_audioStateName: string) {}

  IsEnabled() {
    return this.m_enabled;
  }

  IsVisible() {
    return this.m_visible;
  }

  // ISwButtonBase::SetButtonState and ResetButtonState, which C++ defines in the interface
  SetButtonState(isEnabled: boolean, isFocused = false, skin = '', isBlinking = false) {
    this.SetEnabled(isEnabled);
    this.SetFocused(isFocused);
    this.SetSkin(skin);
    this.SetBlinking(isBlinking);
  }

  ResetButtonState() {}
}
