// Egt::Game::AlphaFamily::TetraRoundOverlayView (BurningCrownTetraSpins10View/Views/TetraRoundOverlayView.h/.cpp): the
// "Tetra activated" and "Tetra completed" splashes, with an event midway through and at the end of each.

import { IAudioApi } from '../../../../../engine/Game/RuntimeImport/IAudioApi';
import { BrowserOnly } from '../../../../../engine/GameCore/Common/BrowserOnly';
import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { make_sentinel, sentinel } from '../../../../../hat_libs/egt_hpp/sentinel';
import * as tweeny from '../../../../../hat_libs/tweeny/tweeny';
import { AnimElement } from '../../../../../engine/GameVideoCtrl/ViewElements/AnimElement';
import { ITetraRoundOverlayView, ITetraRoundOverlayViewEvents } from '../../../../libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';

const TetraRoundOverlayViewId = 'TetraRoundOverlayView';
const AnimIntroId = 'anim_intro';
const AnimOutroId = 'anim_outro';
const SoundSplashIntroId = 'SOUND_TETRA_SPLASH_INTRO';
const SoundSplashOutroId = 'SOUND_TETRA_SPLASH_OUTRO';

enum EMode {
  None,
  Intro,
  Outro,
}

export class TetraRoundOverlayView extends BaseView implements ITetraRoundOverlayView {
  protected readonly m_events = new ITetraRoundOverlayViewEvents();
  private m_actionIntro = new tweeny.tween_action();
  private m_actionOutro = new tweeny.tween_action();
  private m_sentinel = new sentinel();
  private m_mode = EMode.None;

  constructor() {
    super(TetraRoundOverlayViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ITetraRoundOverlayView, this);
    this.RuntimeAdd(ITetraRoundOverlayView.Events, this.m_events);
    this.InitElementsList(TetraRoundOverlayViewId, () => this.OnElementsListLoaded());
    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionIntro);
    tweeny.stop(this.m_actionOutro);
    this.DeinitElementsList();
    this.RuntimeRemove(ITetraRoundOverlayView);
    this.RuntimeRemove(ITetraRoundOverlayView.Events);
    super.Deinit();
  }

  Process() {
    super.Process();
  }

  private OnElementsListLoaded() {
    // the splashes are large: their frames load ahead
    BrowserOnly(() => {
      void this.m_elementsList.TryGet(AnimIntroId, AnimElement)?.Load();
      void this.m_elementsList.TryGet(AnimOutroId, AnimElement)?.Load();
    });
    this.HideMembers();
    this.InitAnimations();
    switch (this.m_mode) {
      case EMode.Intro:
        tweeny.start(this.m_actionIntro, 'TetraRoundOverlayView:Intro');
        break;
      case EMode.Outro:
        tweeny.start(this.m_actionOutro, 'TetraRoundOverlayView:Outro');
        break;
      default:
        break;
    }
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    {
      const animDuration = Math.round(this.m_elementsList.Get(AnimIntroId, AnimElement).GetDuration());
      const midwayDuration = Math.trunc(animDuration / 2);
      const actionMidway = tweeny.delay(midwayDuration, this.m_sentinel);
      actionMidway.on_end.connect(() => {
        this.m_events.introMidway.Post();
      });
      const actionRest = tweeny.delay(animDuration - midwayDuration, this.m_sentinel);
      this.m_actionIntro = tweeny.sequence([actionMidway, actionRest], this.m_sentinel);
      this.m_actionIntro.on_begin.connect(() => {
        this.HideMembers();
        const animIntro = this.m_elementsList.Get(AnimIntroId, AnimElement);
        animIntro.Stop();
        animIntro.Rewind();
        animIntro.Play();
        animIntro.SetHidden(false);
      });
      this.m_actionIntro.on_end.connect(() => {
        this.HideMembers();
        this.m_events.introFinished.Post();
        this.m_mode = EMode.None;
      });
    }
    {
      const animDuration = Math.round(this.m_elementsList.Get(AnimOutroId, AnimElement).GetDuration());
      const midwayDuration = Math.trunc(animDuration / 2);
      const actionMidway = tweeny.delay(midwayDuration, this.m_sentinel);
      actionMidway.on_end.connect(() => {
        this.m_events.outroMidway.Post();
      });
      const actionRest = tweeny.delay(animDuration - midwayDuration, this.m_sentinel);
      this.m_actionOutro = tweeny.sequence([actionMidway, actionRest], this.m_sentinel);
      this.m_actionOutro.on_begin.connect(() => {
        this.HideMembers();
        const animOutro = this.m_elementsList.Get(AnimOutroId, AnimElement);
        animOutro.Stop();
        animOutro.Rewind();
        animOutro.Play();
        animOutro.SetHidden(false);
      });
      this.m_actionOutro.on_end.connect(() => {
        this.HideMembers();
        this.m_events.outroFinished.Post();
        this.m_mode = EMode.None;
      });
    }
  }

  private HideMembers() {
    if (!this.m_elementsList.IsLoaded()) return;
    const animIntro = this.m_elementsList.Find(AnimIntroId, AnimElement);
    if (animIntro) {
      animIntro.Stop();
      animIntro.SetHidden(true);
    }
    const animOutro = this.m_elementsList.Find(AnimOutroId, AnimElement);
    if (animOutro) {
      animOutro.Stop();
      animOutro.SetHidden(true);
    }
  }

  ShowIntro() {
    tweeny.stop(this.m_actionOutro);
    tweeny.start(this.m_actionIntro, 'TetraRoundOverlayView:Intro');
    this.RuntimeGet(IAudioApi).Play(SoundSplashIntroId);
    this.m_mode = EMode.Intro;
  }

  ShowOutro() {
    tweeny.stop(this.m_actionIntro);
    tweeny.start(this.m_actionOutro, 'TetraRoundOverlayView:Outro');
    this.RuntimeGet(IAudioApi).Play(SoundSplashOutroId);
    this.m_mode = EMode.Outro;
  }

  Clear() {
    tweeny.stop(this.m_actionIntro);
    tweeny.stop(this.m_actionOutro);
    this.HideMembers();
    this.m_mode = EMode.None;
  }
}
