// Egt::Game::AlphaFamily::GameBackgroundView (BurningCrownTetraSpins10View/Views/GameBackgroundView.h/.cpp): the main
// or the tetra background, and the panel.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import { IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const GameBackgroundViewId = 'GameBackgroundView';

const ImageBackgroundId = 'image_game_background';
const ImageBackgroundFrameId = 'image_game_background_frame';
const ImagePanelBackgroundId = 'image_panel_background';
const ImagePanelBackgroundFrameId = 'image_panel_background_frame';

const ImageBackgroundTetraId = 'image_game_background_tetra';
const ImageGameBackgroundFrameTetraId = 'image_game_background_frame_tetra';
const ImagePanelBackgroundTetraId = 'image_panel_background_tetra';
const ImagePanelBackgroundFrameTetraId = 'image_panel_background_frame_tetra';

const AnimPanelTetraBetBarId = 'anim_panel_tetra_bet_bar';

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

  protected OnThemeChanged() {
    const isTetraView = this.m_theme === ThemeType.Tetra;

    this.m_elementsList.TryGet(ImageBackgroundId)?.SetHidden(isTetraView);
    this.m_elementsList.TryGet(ImageBackgroundFrameId)?.SetHidden(isTetraView);
    this.m_elementsList.TryGet(ImagePanelBackgroundId)?.SetHidden(isTetraView);
    this.m_elementsList.TryGet(ImagePanelBackgroundFrameId)?.SetHidden(isTetraView);

    this.m_elementsList.TryGet(ImageBackgroundTetraId)?.SetHidden(!isTetraView);
    this.m_elementsList.TryGet(ImageGameBackgroundFrameTetraId)?.SetHidden(!isTetraView);
    this.m_elementsList.TryGet(ImagePanelBackgroundTetraId)?.SetHidden(!isTetraView);
    this.m_elementsList.TryGet(ImagePanelBackgroundFrameTetraId)?.SetHidden(!isTetraView);

    this.m_elementsList.TryGet(AnimPanelTetraBetBarId)?.SetHidden(!isTetraView);
  }

  IsOpaqueFullScreen() {
    return true;
  }

  // IThemeView
  SetTheme(theme: ThemeType) {
    super.SetTheme(theme);
  }
}
