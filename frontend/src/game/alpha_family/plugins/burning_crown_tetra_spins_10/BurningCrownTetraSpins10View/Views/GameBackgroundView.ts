// Egt::Game::AlphaFamily::GameBackgroundView (BurningCrownTetraSpins10View/Views/GameBackgroundView.h/.cpp): the main
// or the tetra background, and the panel.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EBackgroundType, IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const GameBackgroundViewId = 'GameBackgroundView';
const ImageBackgroundId = 'image_game_background';
const ImageBackgroundTetraId = 'image_game_background_tetra';
const ImageTetraSubscreensFrameId = 'image_tetra_subscreens_frame';
const AnimPanelTetraBetBarId = 'anim_panel_tetra_bet_bar';

export class GameBackgroundView extends BaseView implements IGameBackgroundView {
  private readonly m_events = new IControlViewEvents();
  private m_backgroundType = EBackgroundType.Main;

  constructor() {
    super(GameBackgroundViewId);
  }

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

  Draw(drawList: DrawList) {
    const isTetraView = this.m_backgroundType === EBackgroundType.Tetra;
    this.m_elementsList.TryGet(ImageBackgroundId)?.SetHidden(isTetraView);
    this.m_elementsList.TryGet(ImageBackgroundTetraId)?.SetHidden(!isTetraView);
    this.m_elementsList.TryGet(ImageTetraSubscreensFrameId)?.SetHidden(!isTetraView);
    this.m_elementsList.TryGet(AnimPanelTetraBetBarId)?.SetHidden(!isTetraView);
    super.Draw(drawList);
  }

  SetBackgroundType(type: EBackgroundType) {
    this.m_backgroundType = type;
  }
}
