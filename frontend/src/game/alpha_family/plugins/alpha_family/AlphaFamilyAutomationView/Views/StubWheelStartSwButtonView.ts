// Egt::Game::AlphaFamily::Stub::StubWheelStartSwButtonView (AlphaFamilyAutomationView/Views/StubWheelStartSwButtonView.h): the automation's IWheelStartSwButtonView.

import { type ISwButtonBase, IWheelStartSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { StubSwButton } from '../Components/StubSwButton';

export class StubWheelStartSwButtonView extends StubSwButton<ISwButtonBase> implements ISwButtonBase {
  constructor() {
    super(IWheelStartSwButtonView);
  }

  Init(runtime: Runtime) {
    if (!super.Init(runtime)) return false;
    this.SimulateButtonPress();
    return true;
  }

  SetEnabled(enabled: boolean) {
    super.SetEnabled(enabled);
    this.SimulateButtonPress();
  }
}
