// Egt::Game::AlphaFamily::Stub::StubCoinsBarView (AlphaFamilyAutomationView/Views/StubCoinsBarView.h): the automation's ICoinsBarView.

import { ICoinsBarView, type ICoinsBarViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BarsView.bridge';
import { StubView } from '../Components/StubView';

export class StubCoinsBarView extends StubView<ICoinsBarView, ICoinsBarViewEvents> implements ICoinsBarView {
  constructor() {
    super(ICoinsBarView);
  }

  Minimize(_animate: boolean) {}

  Maximize(_animate: boolean) {}

  SetValueNow(_value: number) {}

  SetValue(_value: number) {}
}
