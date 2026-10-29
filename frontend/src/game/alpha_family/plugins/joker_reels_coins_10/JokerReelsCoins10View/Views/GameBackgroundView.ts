// Egt::Game::AlphaFamily::GameBackgroundView (JokerReelsCoins10View/Views/GameBackgroundView.h/.cpp): the background
// and the panel, the same for every round.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EBackgroundType, IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const GameBackgroundViewId = 'GameBackgroundView';

export class GameBackgroundView extends BaseView implements IGameBackgroundView {
  protected readonly m_events = new IControlViewEvents();
  private m_backgroundType = EBackgroundType.Main;

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

  // IGameBackgroundView
  SetBackgroundType(type: EBackgroundType) {
    this.m_backgroundType = type;
  }
}
