// Egt::Game::AlphaFamily::FreeRoundOverlayView (NordicRushView/Views/FreeRoundOverlayView.h/.cpp): the free round's intro
// (a comet flies across while the free spins won zoom in around dummy_pivot) and outro (the total win zooms in), each
// over its background, held two seconds and faded out.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { RemapClamped } from '@game/engine/GameCore/Common/Interpolation';
import type { Color } from '@game/engine/Game/RuntimeExport/IResources';
import type { float } from '@game/engine/GameCore/Common/Types';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ColorTo, PlaceholderFromTo, ZoomIn } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { IFreeRoundOverlayView, IFreeRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IFreeRoundOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const FreeRoundOverlayViewId = 'FreeRoundOverlayView';

const DummyPivotId = 'dummy_pivot';
const AnimBackgroundId = 'anim_background';

const ImageIntroFsWonId = 'image_intro_fs_won';
const TextIntroFsWonId = 'text_intro_fs_won';
const AnimIntroCometFlightId = 'anim_intro_comet_flight';
const DummyIntroCometFlightStartId = 'anim_intro_comet_flight_start';
const DummyIntroCometFlightEndId = 'anim_intro_comet_flight_end';
const ElementsIntroTextIds = [
  ImageIntroFsWonId, TextIntroFsWonId];
const ElementsIntroAllIds = [
  AnimBackgroundId, ImageIntroFsWonId, TextIntroFsWonId, AnimIntroCometFlightId];

const ImageOutroTotalWinId = 'image_outro_total_win';
const TextOutroTotalWinId = 'text_outro_total_win';
const ElementsOutroTextIds = [
  ImageOutroTotalWinId, TextOutroTotalWinId];
const ElementsOutroAllIds = [
  AnimBackgroundId, ImageOutroTotalWinId, TextOutroTotalWinId];

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const IntroCometFlightDuration: tweeny.duration_t = 18 * FrameDuration;
const IntroCometFlightAnimationDuration: tweeny.duration_t = 36 * FrameDuration;
const ShowTextDelay: tweeny.duration_t = 22 * FrameDuration;
const ElementZoomInDuration: tweeny.duration_t = FrameDuration * 11; // 5frames * 41ms;
const ElementFinishedDelay: tweeny.duration_t = 2000;
const ElementFadeOutDuration: tweeny.duration_t = 2000;

const ColorTransparent: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0x00 };
const ColorSolid: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0xFF };

function ZoomInEasing(progress: float): float {
  const threshold: float = (5.0 as float) / (11.0 as float); // ≈ 0.4545
  const scaleStart: float = 0 as float;
  const scaseNormal: float = 1 as float;
  const scaleLarge: float = 1.1 as float;

  if (progress <= threshold) { // frame 0 to 5 ( of 11)
    const remappedProgress: float = RemapClamped(progress, 0 as float, threshold, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_stop2(remappedProgress);
    const zoomLevel: float = RemapClamped(smoothedValue, 0 as float, 1 as float, scaleStart, scaleLarge);
    return zoomLevel;
  } else { // frame 6 to 11 ( of 11)
    const remappedProgress: float = RemapClamped(progress, threshold, 1 as float, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_start_stop2(remappedProgress);
    const zoomLevel: float = RemapClamped(smoothedValue, 0 as float, 1 as float, scaleLarge, scaseNormal);
    return zoomLevel;
  }
}

enum EMode {
  None,
  Intro,
  Outro,
}

export class FreeRoundOverlayView extends BaseView implements IFreeRoundOverlayView {
  protected readonly m_events = new IFreeRoundOverlayViewEvents();

  private m_sentinel = new sentinel();

  private m_actionIntro = new tweeny.tween_action();
  private m_actionOutro = new tweeny.tween_action();
  private m_totalWin = 0;
  private m_freeSpinsWon = 0;

  private m_mode = EMode.None;

  constructor() {
    super(FreeRoundOverlayViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;

    this.RuntimeAdd(IFreeRoundOverlayView, this);
    this.RuntimeAdd(IFreeRoundOverlayView.Events, this.m_events);

    this.InitElementsList(FreeRoundOverlayViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionIntro);
    tweeny.stop(this.m_actionOutro);

    this.DeinitElementsList();

    this.RuntimeRemove(IFreeRoundOverlayView);
    this.RuntimeRemove(IFreeRoundOverlayView.Events);

    super.Deinit();
  }

  private OnElementsListLoaded() {
    // adjust values
    this.HideMembers();
    this.InitAnimations();

    this.AdjustFreeSpinsWon();
    this.AdjustTotalWin();

    // adjust animations
    switch (this.m_mode) {
      case EMode.Intro: tweeny.start(this.m_actionIntro, 'FreeRoundOverlayView:Intro'); break;
      case EMode.Outro: tweeny.start(this.m_actionOutro, 'FreeRoundOverlayView:Outro'); break;
      case EMode.None: // fallthrough
      default: break;
    }
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    // intro animation
    {
      const animCometFlightId = this.m_elementsList.Find(AnimIntroCometFlightId, AnimElement);
      const animCometFlightStart = this.m_elementsList.Find(DummyIntroCometFlightStartId, AnimElement);
      const animCometFlightEnd = this.m_elementsList.Find(DummyIntroCometFlightEndId, AnimElement);
      const actionCometFlight = tweeny.together(
        [tweeny.delay(IntroCometFlightAnimationDuration),
          PlaceholderFromTo(
            animCometFlightId, animCometFlightStart, animCometFlightEnd, IntroCometFlightDuration)],
        this.m_sentinel);
      actionCometFlight.on_begin.connect(() => {
        const animCometFlight = this.m_elementsList.Get(AnimIntroCometFlightId, AnimElement);
        animCometFlight.Stop();
        animCometFlight.Rewind();
        animCometFlight.Play();
        animCometFlight.SetHidden(false);

        this.m_events.outroFinished.Post();
      });
      actionCometFlight.on_end.connect(() => {
        const animCometFlight = this.m_elementsList.Get(AnimIntroCometFlightId, AnimElement);
        animCometFlight.SetHidden(true);
      });

      const pivot1 = this.m_elementsList.Get(DummyPivotId).GetWorldPivot();
      this.m_elementsList.SetWorldPivot(pivot1, ElementsIntroTextIds);

      const actionDelayText = tweeny.delay(ShowTextDelay, this.m_sentinel);
      const actionsZoomIn: tweeny.tween_action[] = [];
      for (const id of ElementsIntroTextIds) {
        const elementIntro = this.m_elementsList.Find(id, BaseElement);
        if (elementIntro) {
          actionsZoomIn.push(ZoomIn(elementIntro, ElementZoomInDuration, ZoomInEasing));
        }
      }
      const actionZoomIn = tweeny.together(actionsZoomIn, this.m_sentinel);
      actionZoomIn.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, ElementsIntroTextIds);
      });
      actionZoomIn.on_end.connect(() => {
        this.m_events.introMidway.Post();
      });

      const actionFinishedDelay = tweeny.delay(ElementFinishedDelay);

      const actionsFadeOut: tweeny.tween_action[] = [];
      for (const id of ElementsIntroAllIds) {
        const elementFadeOut = this.m_elementsList.Find(id, BaseElement);
        if (elementFadeOut) {
          actionsFadeOut.push(ColorTo(elementFadeOut, ColorTransparent, ElementFadeOutDuration));
        }
      }
      const actionFadeOut = tweeny.together(actionsFadeOut, this.m_sentinel);

      this.m_actionIntro = tweeny.together(
        [actionCometFlight,
          tweeny.sequence([actionDelayText, actionZoomIn, actionFinishedDelay, actionFadeOut], this.m_sentinel)],
        this.m_sentinel);
      this.m_actionIntro.on_begin.connect(() => {
        this.HideMembers();
        this.m_elementsList.SetColor(ColorSolid, ElementsIntroAllIds);

        const animBackground = this.m_elementsList.Get(AnimBackgroundId, AnimElement);
        animBackground.Stop();
        animBackground.Rewind();
        animBackground.Play();
        animBackground.SetHidden(false);
      });
      this.m_actionIntro.on_end.connect(() => {
        this.HideMembers();
        this.m_events.introFinished.Post();
      });
    }

    // outro animation
    {
      const pivot2 = this.m_elementsList.Get(DummyPivotId).GetWorldPivot();
      this.m_elementsList.SetWorldPivot(pivot2, ElementsOutroTextIds);

      const actionDelayText = tweeny.delay(ShowTextDelay, this.m_sentinel);
      const actionsZoomIn: tweeny.tween_action[] = [];
      for (const id of ElementsOutroTextIds) {
        const elementOutro = this.m_elementsList.Find(id, BaseElement);
        if (elementOutro) {
          actionsZoomIn.push(ZoomIn(elementOutro, ElementZoomInDuration, ZoomInEasing));
        }
      }
      const actionElementsZoomIn = tweeny.together(actionsZoomIn, this.m_sentinel);
      actionElementsZoomIn.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, ElementsOutroTextIds);
      });
      actionElementsZoomIn.on_end.connect(() => {
        this.m_events.outroMidway.Post();
      });

      const actionFinishedDelay = tweeny.delay(ElementFinishedDelay);

      const actionsFadeOut: tweeny.tween_action[] = [];
      for (const id of ElementsOutroAllIds) {
        const elementFadeOut = this.m_elementsList.Find(id, BaseElement);
        if (elementFadeOut) {
          actionsFadeOut.push(ColorTo(elementFadeOut, ColorTransparent, ElementFadeOutDuration));
        }
      }
      const actionFadeOut = tweeny.together(actionsFadeOut, this.m_sentinel);

      this.m_actionOutro =
        tweeny.sequence([actionDelayText, actionElementsZoomIn, actionFinishedDelay, actionFadeOut], this.m_sentinel);
      this.m_actionOutro.on_begin.connect(() => {
        this.HideMembers();
        this.m_elementsList.SetColor(ColorSolid, ElementsOutroAllIds);

        const animBackground = this.m_elementsList.Get(AnimBackgroundId, AnimElement);
        animBackground.Stop();
        animBackground.Rewind();
        animBackground.Play();
        animBackground.SetHidden(false);
      });
      this.m_actionOutro.on_end.connect(() => {
        this.HideMembers();
        this.m_events.outroFinished.Post();
      });
    }
  }

  private HideMembers() {
    this.m_elementsList.SetHidden(
      true,
      [AnimBackgroundId,
        ImageIntroFsWonId,
        TextIntroFsWonId,
        ImageOutroTotalWinId,
        TextOutroTotalWinId,
        AnimIntroCometFlightId]);
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

  // IFreeRoundOverlayView
  ShowIntro() {
    tweeny.start(this.m_actionIntro, 'FreeRoundOverlayView:Intro');

    this.m_mode = EMode.Intro;
  }

  ShowOutro() {
    tweeny.start(this.m_actionOutro, 'FreeRoundOverlayView:Outro');

    this.m_mode = EMode.Outro;
  }

  Clear() {
    this.m_mode = EMode.None;
  }

  private AdjustTotalWin() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    const totalWinText = this.m_elementsList.Get(TextOutroTotalWinId, TextElement);
    totalWinText.SetText(this.RuntimeGetConst(ILocalization).FormatCurrency(this.m_totalWin));
  }

  private AdjustFreeSpinsWon() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    const totalWinText = this.m_elementsList.Get(TextIntroFsWonId, TextElement);
    totalWinText.SetText(`${this.m_freeSpinsWon}`);
  }

  SetRewardedAmount(rewarded: number) {
    if (this.m_totalWin === rewarded) return;
    this.m_totalWin = rewarded;
    this.AdjustTotalWin();
  }

  SetFreeSpinsRewarded(rewarded: number) {
    if (this.m_freeSpinsWon === rewarded) return;
    this.m_freeSpinsWon = rewarded;
    this.AdjustFreeSpinsWon();
  }
}
