// Egt::Game::AlphaFamily::GameBackgroundView (NordicRushView/Views/GameBackgroundView.h/.cpp): the background
// and the panel, the same for every round, with the knobs' animations, each played again after a few seconds.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { CountdownTimer } from '@game/engine/Game/Utils/CountdownTimer';
import type { int } from '@game/engine/GameCore/Common/Types';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { IControlViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { EBackgroundType, IGameBackgroundView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const GameBackgroundViewId = 'GameBackgroundView';

const AnimKnobsLeftId = 'anim_knobs_left';
const AnimKnobsRightId = 'anim_knobs_right';

// the static int state of Process()'s updateAnimKnobs, shared by both knobs and every view
let state: int = 0;

export class GameBackgroundView extends BaseView implements IGameBackgroundView {
  protected readonly m_events = new IControlViewEvents();

  private m_idleTimerLeft = new CountdownTimer();
  private m_idleTimerRight = new CountdownTimer();
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

  Process() {
    super.Process();

    if (this.m_elementsList.IsLoaded()) {
      const updateAnimKnobs = (timer: CountdownTimer, animId: string) => {
        const anim = this.m_elementsList.Get(animId, AnimElement);
        if (timer.IsExpired()) {
          anim.SetHidden(false);
          anim.Rewind();
          anim.Play();

          state = state + Math.trunc(anim.GetPosition().x) + 23;
          timer.SetDuration((state % 13) * 1000);
          timer.Start();
        }
        if (!anim.IsPlaying()) {
          anim.SetHidden(true);
        }
      };

      updateAnimKnobs(this.m_idleTimerLeft, AnimKnobsLeftId);
      updateAnimKnobs(this.m_idleTimerRight, AnimKnobsRightId);
    }
  }

  IsOpaqueFullScreen() {
    return true;
  }

  // IGameBackgroundView
  SetBackgroundType(type: EBackgroundType) {
    this.m_backgroundType = type;
  }
}
