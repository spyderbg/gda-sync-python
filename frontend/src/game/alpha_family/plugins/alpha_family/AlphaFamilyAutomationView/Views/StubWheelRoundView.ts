// Egt::Game::AlphaFamily::Stub::StubWheelRoundView (AlphaFamilyAutomationView/Views/StubWheelRoundView.h): the automation's IWheelRoundView.

import { IWheelRoundView, type IWheelRoundViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { StubView } from '../Components/StubView';

export class StubWheelRoundView extends StubView<IWheelRoundView, IWheelRoundViewEvents> implements IWheelRoundView {
  constructor() {
    super(IWheelRoundView);
  }

  SetEnabled(_enabled: boolean) {}

  SetVisible(_visible: boolean) {}

  SetFocused(_focused: boolean) {}

  SetSkin(_skin: string) {}

  SetSectorWins(_wins: number[], _betGroup: number) {}

  StartSpinning() {
    this.m_events!.spinningStarted.Post();
    this.m_events!.spinningFinished.Post();
  }

  StopSpinning(_sector: number) {}

  StartPresentingWin() {
    this.m_events!.winPresentingFinished.Post();
  }

  Clear() {}
}
