// Egt::Game::AlphaFamily::GambleRoundOverlayView (JokerReelsCoins10View/Views/GambleRoundOverlayView.h/.cpp): the
// gamble's intro, at once with its sound, and its outro, which fades its overlay in (then the gamble's outro midway)
// and out.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { FadeIn, FadeOut } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IGambleRoundOverlayView, IGambleRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IGambleRoundOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { Unless } from '@game/engine/GameCore/Common/Defensive';

const OutroFadeInDuration = 500;
const OutroFadeOutDuration = 500;
const GambleRoundOverlayViewId = 'GambleRoundOverlayView';

const SoundIntroId = 'SOUND_GAMBLE_INTRO';
const ImageOutroOverlayId = 'image_outro_overlay';

enum ESubstate {
  Idle,
  Intro,
  Outro,
}

export class GambleRoundOverlayView extends BaseView implements IGambleRoundOverlayView {
  protected readonly m_events = new IGambleRoundOverlayViewEvents();

  private m_substate = ESubstate.Idle;

  private m_actionOutroFadeIn = new tweeny.tween_action();
  private m_actionOutroFadeOut = new tweeny.tween_action();

  constructor() {
    super(GambleRoundOverlayViewId);
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

    this.RuntimeAdd(IGambleRoundOverlayView, this);
    this.RuntimeAdd(IGambleRoundOverlayView.Events, this.m_events);

    // init elements list
    this.InitElementsList(GambleRoundOverlayViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  private OnElementsListLoaded() {
    this.m_actionOutroFadeIn = FadeIn(this.m_elementsList.Find(ImageOutroOverlayId, ImageElement), OutroFadeInDuration);
    this.m_actionOutroFadeIn.on_end.connect(() => {
      this.m_events.outroMidway.Post();
      tweeny.start(this.m_actionOutroFadeOut, 'GambleRoundOverlayView:FadeOut');
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

    this.RuntimeRemove(IGambleRoundOverlayView);
    this.RuntimeRemove(IGambleRoundOverlayView.Events);

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

  // IGambleRoundOverlayView
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
          this.RuntimeGet(IAudioApi).Play(SoundIntroId);
        }
        break;
      case ESubstate.Outro:
        {
          tweeny.start(this.m_actionOutroFadeIn, 'GambleRoundOverlayView:FadeIn');
          this.SetVisible(true);
        }
        break;
    }
  }
}
