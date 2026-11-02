// Egt::Game::AlphaFamily::Stub::WheelStrategy_StubStartGameHwButton (AlphaFamilyAutomationView/Views/WheelStrategy_StubStartGameHwButton.h): the automation's IStartHwButton.

import { type HwButtonState, IStartHwButton } from '@game/engine/Game/RuntimeImport/HwButtons.bridge';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { StubHwButton } from '../Components/StubHwButton';

export class WheelStrategy_StubStartGameHwButton extends StubHwButton {
  constructor() {
    super(IStartHwButton);
  }

  Init(runtime: Runtime) {
    if (!super.Init(runtime)) {
      console.assert(false);
      return false;
    }
    this.m_state = this.m_interface!.GetButtonState();
    this.SimulateButtonPress();
    return true;
  }

  SetButtonState(state: HwButtonState) {
    super.SetButtonState(state);
    this.SimulateButtonPress();
  }
}
