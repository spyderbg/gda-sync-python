// Egt::Game::AlphaFamily::Stub::StubCoinsFreeSpinBarView (AlphaFamilyAutomationView/Views/StubCoinsFreeSpinBarView.h): the automation's ICoinsFreeSpinBarView.

import { ICoinsFreeSpinBarView } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import type { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { StubControl } from '../Components/StubControl';

export class StubCoinsFreeSpinBarView extends StubControl<ICoinsFreeSpinBarView, IControlViewEvents> implements ICoinsFreeSpinBarView {
  constructor() {
    super(ICoinsFreeSpinBarView);
  }

  SetCurrentCounter(_current: number) {}

  SetTotalCounterTarget(_target: number) {}
}
