// Egt::Game::AlphaFamily::GameBackgroundTetraView (BurningCrownTetraSpins10View/Views/GameBackgroundTetraView.h/.cpp):
// the tetra round's background, frame and panel, which the game background view shows instead of its own.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const GameBackgroundTetraViewId = 'GameBackgroundTetraView';

export class GameBackgroundTetraView extends BaseView {
  constructor() {
    super(GameBackgroundTetraViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.InitElementsList(GameBackgroundTetraViewId);

    super.SetVisible(false);

    return true;
  }

  Deinit() {
    this.DeinitElementsList();

    super.Deinit();
  }

  IsOpaqueFullScreen() {
    return this.IsVisible();
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
  }
}
