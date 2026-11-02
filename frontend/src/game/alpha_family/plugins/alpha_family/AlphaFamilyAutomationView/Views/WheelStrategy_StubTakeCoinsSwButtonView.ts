// Egt::Game::AlphaFamily::Stub::WheelStrategy_StubTakeCoinsSwButtonView (AlphaFamilyAutomationView/Views/WheelStrategy_StubTakeCoinsSwButtonView.h): the automation's ITakeCoinsSwButtonView.

import { ITakeCoinsSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { StubSwButton } from '../Components/StubSwButton';

export class WheelStrategy_StubTakeCoinsSwButtonView extends StubSwButton<ITakeCoinsSwButtonView> implements ITakeCoinsSwButtonView {
  constructor() {
    super(ITakeCoinsSwButtonView);
  }

  Init(runtime: Runtime) {
    if (!super.Init(runtime)) {
      console.assert(false);
      return false;
    }
    this.SimulateButtonPress();
    return true;
  }

  SetEnabled(enabled: boolean) {
    super.SetEnabled(enabled);
    this.SimulateButtonPress();
  }

  EnableButtonSkin(enabled: boolean) {
    this.SetEnabled(enabled);
  }
}
