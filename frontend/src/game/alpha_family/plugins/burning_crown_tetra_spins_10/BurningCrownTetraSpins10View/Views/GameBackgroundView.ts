// Egt::Game::AlphaFamily::GameBackgroundView (BurningCrownTetraSpins10View/Views/GameBackgroundView.h/.cpp): the main
// background and the panel; in the tetra round it hides, and shows its tetra view (GameBackgroundTetraView) instead.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EBackgroundType, IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import type { GameBackgroundTetraView } from './GameBackgroundTetraView';

const GameBackgroundViewId = 'GameBackgroundView';

export class GameBackgroundView extends BaseView implements IGameBackgroundView {
  protected readonly m_events = new IControlViewEvents();

  private readonly m_tetraView: GameBackgroundTetraView | null;

  constructor(tetraView: GameBackgroundTetraView | null) {
    super(GameBackgroundViewId);
    this.m_tetraView = tetraView;
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
    return this.IsVisible();
  }

  // IGameBackgroundView
  SetBackgroundType(type: EBackgroundType) {
    const isTetraView = type === EBackgroundType.Tetra;

    super.SetVisible(!isTetraView);

    if (Unless(this.m_tetraView)) return;
    this.m_tetraView!.SetVisible(isTetraView);
  }
}
