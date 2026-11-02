// Egt::Game::AlphaFamily::Stub::StubFreeSpinBarView (AlphaFamilyAutomationView/Views/StubFreeSpinBarView.h): the automation's IFreeSpinBarView.

import { IFreeSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubControl } from '../Components/StubControl';

export class StubFreeSpinBarView extends StubControl<IFreeSpinBarView, IControlViewEvents> implements IFreeSpinBarView {
  constructor() {
    super(IFreeSpinBarView);
  }

  SetCurrentCounter(_current: number) {}

  SetTotalCounterTarget(_target: number) {}
}
