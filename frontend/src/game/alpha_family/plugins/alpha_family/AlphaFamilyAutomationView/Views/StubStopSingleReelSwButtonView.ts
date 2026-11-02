// Egt::Game::AlphaFamily::Stub::StubStopSingleReelSwButtonView (AlphaFamilyAutomationView/Views/StubStopSingleReelSwButtonView.h): the automation's IStopSingleReelSwButtonView.

import { IStopSingleReelSwButtonView, type IStopSingleReelSwButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubView } from '../Components/StubView';

export class StubStopSingleReelSwButtonView extends StubView<IStopSingleReelSwButtonView, IStopSingleReelSwButtonViewEvents> implements IStopSingleReelSwButtonView {
  constructor() {
    super(IStopSingleReelSwButtonView);
  }

  // SetEnabled(bool) and SetEnabled(int, bool)
  SetEnabled(..._args: [boolean] | [number, boolean]) {}
}
