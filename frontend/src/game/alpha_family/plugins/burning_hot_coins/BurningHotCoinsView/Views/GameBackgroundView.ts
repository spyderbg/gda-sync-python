// Egt::Game::AlphaFamily::GameBackgroundView (BurningHotCoinsView/Views/GameBackgroundView.h/.cpp): the background
// and the panel, the same for every round.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const GameBackgroundViewId = 'GameBackgroundView';

export class GameBackgroundView extends BaseView implements IGameBackgroundView {
  protected readonly m_events = new IControlViewEvents();

  constructor() {
    super(GameBackgroundViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IGameBackgroundView, this);
    this.RuntimeAdd(IGameBackgroundView.Events, this.m_events);

    this.InitElementsList(GameBackgroundViewId);

    return true;
  }

  Deinit() {
    this.DeinitElementsList();

    this.RuntimeRemove(IGameBackgroundView);
    this.RuntimeRemove(IGameBackgroundView.Events);

    super.Deinit();
  }

  IsOpaqueFullScreen() {
    return true;
  }

  // IThemeView
  SetTheme(theme: ThemeType) {
    super.SetTheme(theme);
  }
}
