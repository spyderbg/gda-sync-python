// Egt::Game::AlphaFamily::WheelRoundOverlayView (JokerReelsCoins10View/Views/WheelRoundOverlayView.h/.cpp): the coins
// wheel's intro, at once, and its outro, which fades its overlay in (then the wheel's outro midway) and out.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';

import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { FadeIn, FadeOut } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IWheelRoundOverlayView, IWheelRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { Unless } from '@game/engine/GameCore/Common/Defensive';

const OutroFadeInDuration = 500;
const OutroFadeOutDuration = 500;
const WheelRoundOverlayViewId = 'WheelRoundOverlayView';

const ImageOutroOverlayId = 'image_outro_overlay';

enum ESubstate {
  Idle,
  Intro,
  Outro,
}

export class WheelRoundOverlayView extends BaseView implements IWheelRoundOverlayView {
  protected readonly m_events = new IWheelRoundOverlayViewEvents();

  private m_substate = ESubstate.Idle;

  private m_actionOutroFadeIn = new tweeny.tween_action();
  private m_actionOutroFadeOut = new tweeny.tween_action();

  constructor() {
    super(WheelRoundOverlayViewId);
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

    this.RuntimeAdd(IWheelRoundOverlayView, this);
    this.RuntimeAdd(IWheelRoundOverlayView.Events, this.m_events);

    // init elements list
    this.InitElementsList(WheelRoundOverlayViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  private OnElementsListLoaded() {
    this.m_actionOutroFadeIn = FadeIn(this.m_elementsList.Find(ImageOutroOverlayId, ImageElement), OutroFadeInDuration);
    this.m_actionOutroFadeIn.on_end.connect(() => {
      this.m_events.outroMidway.Post();
      tweeny.start(this.m_actionOutroFadeOut, 'WheelRoundOverlayView:OutroFadeOut');
    });

    this.m_actionOutroFadeOut =
      FadeOut(this.m_elementsList.Find(ImageOutroOverlayId, ImageElement), OutroFadeOutDuration);
    this.m_actionOutroFadeOut.on_end.connect(() => {
      this.m_events.outroFinished.Post();
      this.SetVisible(false);
    });

    this.AdjustSubstate();
  }

  Deinit() {
    tweeny.stop(this.m_actionOutroFadeIn);
    tweeny.stop(this.m_actionOutroFadeOut);

    this.DeinitElementsList();

    this.RuntimeRemove(IWheelRoundOverlayView);
    this.RuntimeRemove(IWheelRoundOverlayView.Events);

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
      case ESubstate.Outro: break;
    }
  }

  // IWheelRoundOverlayView
  StartIntro() {
    this.m_substate = ESubstate.Intro;
    this.AdjustSubstate();
  }

  StartOutro() {
    this.m_substate = ESubstate.Outro;
    this.AdjustSubstate();
  }

  Clear() {
    this.m_substate = ESubstate.Idle;
    this.AdjustSubstate();
  }

  private AdjustSubstate() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    switch (this.m_substate) {
      case ESubstate.Idle:
        {
          this.SetVisible(false);
        }
        break;
      case ESubstate.Intro:
        {
          this.SetVisible(false);
        }
        break;
      case ESubstate.Outro:
        {
          tweeny.start(this.m_actionOutroFadeIn, 'WheelRoundOverlayView:OutroFadeIn');
          this.SetVisible(true);
        }
        break;
    }
  }
}
