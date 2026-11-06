// Egt::Game::AlphaFamily::KnobsView (BurningCrownTetraSpins10View/Views/KnobsView.h/.cpp): the line knobs beside the
// reels, one pair for the main reels and two for the tetra screens.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import type { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { IKnobsView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { ThemeLayout } from '../ThemeLayout';

const KnobsViewId = 'KnobsView';

export class KnobsView extends BaseView implements IKnobsView {
  protected readonly m_events = new IControlViewEvents();
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

  constructor() {
    super(KnobsViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IKnobsView, this);
    this.RuntimeAdd(IKnobsView.Events, this.m_events);

    this.InitElementsList(KnobsViewId);

    return true;
  }

  Deinit() {
    this.DeinitElementsList();

    this.RuntimeRemove(IKnobsView);
    this.RuntimeRemove(IKnobsView.Events);

    super.Deinit();
  }

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
  }

  // IControlView
  SetEnabled(enabled: boolean) {
    this.m_control.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    this.m_control.SetVisible(visible);
  }

  SetFocused(focused: boolean) {
    this.m_control.SetFocused(focused);
  }

  SetSkin(skin: string) {
    this.m_control.SetSkin(skin);
  }

  // IThemeView
  SetTheme(theme: ThemeType) {
    super.SetTheme(theme);
  }
}
