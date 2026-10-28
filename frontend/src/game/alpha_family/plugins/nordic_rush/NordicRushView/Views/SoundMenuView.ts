// Egt::Game::AlphaFamily::SoundMenuView (NordicRushView/Views/SoundMenuView.h/.cpp): the volume presets.
// NordicRush cycles them with the sound button; the menu has no elements and no animations, so it opens
// and closes at once.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { type ISoundMenuView, ISoundMenuView as ISoundMenuViewToken, ISoundMenuViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { MenuView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/MenuView';

const SoundMenuViewId = 'SoundMenuView';

export class SoundMenuView extends BaseView implements ISoundMenuView {
  private readonly m_events = new ISoundMenuViewEvents();
  private readonly m_menu = new MenuView(this.m_events);
  private m_currentVolume = 0;
  private m_possibleVolumes: number[] = [];

  constructor() {
    super(SoundMenuViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ISoundMenuViewToken, this);
    this.RuntimeAdd(ISoundMenuViewToken.Events, this.m_events);
    this.m_menu.Init(this.GetRuntime());
    return true;
  }

  Deinit() {
    this.m_menu.Deinit();
    this.RuntimeRemove(ISoundMenuViewToken);
    this.RuntimeRemove(ISoundMenuViewToken.Events);
    super.Deinit();
  }

  Process() {
    super.Process();
    this.m_menu.Process();
  }

  OpenMenu() {
    this.m_menu.OpenMenu();
  }

  CloseMenu() {
    this.m_menu.CloseMenu();
  }

  SetCurrentVolume(volume: number) {
    this.m_currentVolume = volume;
  }

  SetPossibleVolumes(volumes: number[]) {
    this.m_possibleVolumes = volumes;
  }
}
