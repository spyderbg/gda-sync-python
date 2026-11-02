// Egt::Game::AlphaFamily::Stub::StubExtraFreeSpinBarView (AlphaFamilyAutomationView/Views/StubExtraFreeSpinBarView.h): the automation's IExtraFreeSpinBarView.

import { IExtraFreeSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubControl } from '../Components/StubControl';

export class StubExtraFreeSpinBarView extends StubControl<IExtraFreeSpinBarView, IControlViewEvents> implements IExtraFreeSpinBarView {
  constructor() {
    super(IExtraFreeSpinBarView);
  }

  SetCurrentCounter(_current: number) {}

  SetTotalCounterTarget(_target: number) {}
}
