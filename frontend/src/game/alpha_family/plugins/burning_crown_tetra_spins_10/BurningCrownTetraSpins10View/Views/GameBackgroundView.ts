// Egt::Game::AlphaFamily::GameBackgroundView (BurningCrownTetraSpins10View/Views/GameBackgroundView.h/.cpp): the main
// or the tetra background, and the panel.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { ThemeLayout } from '../ThemeLayout';

const GameBackgroundViewId = 'GameBackgroundView';

export class GameBackgroundView extends BaseView implements IGameBackgroundView {
  protected readonly m_events = new IControlViewEvents();
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

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

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
  }

  IsOpaqueFullScreen() {
    return true;
  }

  // IThemeView
  SetTheme(theme: ThemeType) {
    super.SetTheme(theme);
  }
}
