// Egt::Game::AlphaFamily::Stub::StubHwButton<Interface> (AlphaFamilyAutomationView/Components/StubHwButton.h): a stub of
// a cabinet button, which keeps its state and is pressed only while enabled.

import { HwButtonLight, type HwButtonState, type HwButtonToken, type IHwButton, type IHwButtonEvents } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import { StubView } from './StubView';

export abstract class StubHwButton extends StubView<IHwButton, IHwButtonEvents> implements IHwButton {
  protected m_state: Required<HwButtonState> = { enabled: false, light: HwButtonLight.Off };

  constructor(token: HwButtonToken) {
    super(token);
  }

  ////////////////////////////////////////////////////////////////////////////////
  /// IHwButton
  ////////////////////////////////////////////////////////////////////////////////

  SetButtonState(state: HwButtonState) {
    this.m_state = { enabled: state.enabled ?? false, light: state.light ?? HwButtonLight.Off };
  }

  SimulateButtonPress() {
    if (!this.m_state.enabled) return;
    this.m_events!.buttonPressedEvent.Post();
  }

  // IsButtonEnabled and GetButtonLight
  GetButtonState() {
    return { ...this.m_state };
  }
}
