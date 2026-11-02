// Egt::Game::AlphaFamily::Stub::StubControl<Interface> (AlphaFamilyAutomationView/Components/StubControl.h): a stub of a
// control view, which keeps whether it is enabled, visible and focused.

import { StubView } from './StubView';

export abstract class StubControl<Interface, Events> extends StubView<Interface, Events> {
  protected m_enabled = true;
  protected m_visible = true;
  protected m_focused = false;

  ////////////////////////////////////////////////////////////////////////////////
  /// IControl
  ////////////////////////////////////////////////////////////////////////////////

  SetEnabled(enabled: boolean) {
    if (this.m_enabled !== enabled) {
      this.m_enabled = enabled;
    }
  }

  SetVisible(visible: boolean) {
    if (this.m_visible !== visible) {
      this.m_visible = visible;
    }
  }

  SetFocused(focused: boolean) {
    if (this.m_focused !== focused) {
      this.m_focused = focused;
    }
  }

  SetSkin(_skin: string) {}
}
