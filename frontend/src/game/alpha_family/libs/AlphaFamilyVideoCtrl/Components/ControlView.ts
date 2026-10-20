// Egt::Game::AlphaFamily::ControlView (AlphaFamilyVideoCtrl/Components/ControlView.h/.cpp): a view's control state.

export class ControlView {
  m_enabled = true;
  m_visible = true;
  m_focused = false;
  m_skin = '';

  SetEnabled(enabled: boolean) {
    this.m_enabled = enabled;
  }

  SetVisible(visible: boolean) {
    this.m_visible = visible;
  }

  SetFocused(focused: boolean) {
    this.m_focused = focused;
  }

  SetSkin(skin: string) {
    this.m_skin = skin;
  }
}
