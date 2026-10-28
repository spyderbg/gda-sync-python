// Egt::Game::AlphaFamily::CoinsRoundOverlayView (NordicRushView/Views/CoinsRoundOverlayView.h/.cpp): the coins
// round's intro and outro, which have no elements: each posts its midway and its end on the next frame.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ICoinsRoundOverlayView, ICoinsRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/ICoinsRoundOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

enum ESubstate {
  Idle,
  Intro,
  Outro,
}

export class CoinsRoundOverlayView extends BaseView implements ICoinsRoundOverlayView {
  protected readonly m_events = new ICoinsRoundOverlayViewEvents();

  private m_substate = ESubstate.Idle;

  constructor() {
    super('CoinsRoundOverlayView');
  }

  // IControlView
  SetEnabled(enabled: boolean) {
    super.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    super.SetVisible(visible);
  }

  SetFocused(focused: boolean) {
    super.SetFocused(focused);
  }

  SetSkin(skin: string) {
    super.SetSkin(skin);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ICoinsRoundOverlayView, this);
    this.RuntimeAdd(ICoinsRoundOverlayView.Events, this.m_events);

    return true;
  }

  Deinit() {
    this.RuntimeRemove(ICoinsRoundOverlayView);
    this.RuntimeRemove(ICoinsRoundOverlayView.Events);
    super.Deinit();
  }

  Process() {
    switch (this.m_substate) {
      case ESubstate.Idle: break;
      case ESubstate.Intro:
        {
          this.m_events.introMidway.Post();
          this.m_events.introFinished.Post();
          this.m_substate = ESubstate.Idle;
        }
        break;
      case ESubstate.Outro:
        {
          this.m_events.outroMidway.Post();
          this.m_events.outroFinished.Post();
          this.m_substate = ESubstate.Idle;
        }
        break;
    }
  }

  // ICoinsRoundOverlayView
  ShowIntro() {
    this.m_substate = ESubstate.Intro;
  }

  ShowOutro() {
    this.m_substate = ESubstate.Outro;
  }

  Clear() {
    this.m_substate = ESubstate.Idle;
  }
}
