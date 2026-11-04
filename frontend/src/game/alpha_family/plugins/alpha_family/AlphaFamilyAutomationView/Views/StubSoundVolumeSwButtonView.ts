// Egt::Game::AlphaFamily::Stub::StubSoundVolumeSwButtonView (AlphaFamilyAutomationView/Views/StubSoundVolumeSwButtonView.h): the automation's ISoundVolumeSwButtonView.

import { ISoundVolumeSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { StubSwButton } from '../Components/StubSwButton';

export class StubSoundVolumeSwButtonView extends StubSwButton<ISoundVolumeSwButtonView> implements ISoundVolumeSwButtonView {
  constructor() {
    super(ISoundVolumeSwButtonView);
  }

  SetCurrentVolume(_volume: number) {}
}
