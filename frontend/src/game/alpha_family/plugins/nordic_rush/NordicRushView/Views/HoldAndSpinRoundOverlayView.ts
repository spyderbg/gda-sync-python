// Egt::Game::AlphaFamily::HoldAndSpinRoundOverlayView (NordicRushView/Views/HoldAndSpinRoundOverlayView.h/.cpp): the hold
// and spin round's intro (its background, then the bonus banner zooming in around dummy_pivot until START is pressed,
// then a fade out while the info screen plays its intro), and the flash spin banner. Its outro has no animation.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { RemapClamped } from '@game/engine/GameCore/Common/Interpolation';
import type { Color } from '@game/engine/Game/RuntimeExport/IResources';
import type { float } from '@game/engine/GameCore/Common/Types';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { ColorTo, ZoomIn } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { IHoldAndSpinRoundOverlayView, IHoldAndSpinRoundOverlayViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const HoldAndSpinRoundOverlayViewId = 'HoldAndSpinRoundOverlayView';

const DummyPivotId = 'dummy_pivot';

const AnimBackgroundId = 'anim_background';
const AnimBonusId = 'anim_bonus';
const ImageBonusPrizeFeatureId = 'image_bonus_prize_feature';
const ImagePressStartId = 'image_press_start';
const ImageFlashSpinId = 'image_flash_spin';
const ElementsBonusIds = [
  AnimBonusId, ImageBonusPrizeFeatureId, ImagePressStartId];
const ElementsAllIds = [
  AnimBackgroundId, AnimBonusId, ImageBonusPrizeFeatureId, ImagePressStartId, ImageFlashSpinId];

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const ShowTextDelay: tweeny.duration_t = 22 * FrameDuration;
const ElementZoomInDuration: tweeny.duration_t = FrameDuration * 11; // 5frames * 41ms;
const ElementFadeOutDuration: tweeny.duration_t = 2000;
const HoldAndSpinInfoViewIntroAnimationDuration: tweeny.duration_t = 115 * FrameDuration;

const ColorTransparent: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0x00 };
const ColorSolid: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0xFF };

function ZoomInEasing(progress: float): float {
  const threshold: float = (5.0 as float) / (11.0 as float); // ≈ 0.4545
  const scaleStart: float = 0 as float;
  const scaleNormal: float = 1 as float;
  const scaleLarge: float = 1.1 as float;

  if (progress <= threshold) { // frame 0 to 5 ( of 11)
    const remappedProgress: float = RemapClamped(progress, 0 as float, threshold, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_stop2(remappedProgress);
    const zoomLevel: float = RemapClamped(smoothedValue, 0 as float, 1 as float, scaleStart, scaleLarge);
    return zoomLevel;
  } else { // frame 6 to 11 ( of 11)
    const remappedProgress: float = RemapClamped(progress, threshold, 1 as float, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_start2(remappedProgress);
    const zoomLevel: float = RemapClamped(smoothedValue, 0 as float, 1 as float, scaleLarge, scaleNormal);
    return zoomLevel;
  }
}

enum EMode {
  None,
  Intro,
  Outro,
}

export class HoldAndSpinRoundOverlayView extends BaseView implements IHoldAndSpinRoundOverlayView {
  protected readonly m_events = new IHoldAndSpinRoundOverlayViewEvents();

  private m_sentinel = new sentinel();

  private m_actionDummy = new tweeny.tween_action();
  private m_actionIntroShow = new tweeny.tween_action();
  private m_actionIntroHide = new tweeny.tween_action();
  private m_actionOutro = new tweeny.tween_action();

  private m_mode = EMode.None;

  private m_isDirty = false;
  private m_isBannerVisible = false;

  constructor() {
    super(HoldAndSpinRoundOverlayViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    if (AssertUnless(super.Init(runtime))) return false;
    this.RuntimeAdd(IHoldAndSpinRoundOverlayView, this);
    this.RuntimeAdd(IHoldAndSpinRoundOverlayView.Events, this.m_events);

    this.InitElementsList(HoldAndSpinRoundOverlayViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    tweeny.stop(this.m_actionIntroShow);
    tweeny.stop(this.m_actionIntroHide);
    tweeny.stop(this.m_actionOutro);

    this.DeinitElementsList();

    this.RuntimeRemove(IHoldAndSpinRoundOverlayView);
    this.RuntimeRemove(IHoldAndSpinRoundOverlayView.Events);

    super.Deinit();
  }

  private OnElementsListLoaded() {
    // adjust values
    this.HideMembers();
    this.InitAnimations();

    // adjust animations
    switch (this.m_mode) {
      case EMode.Intro: tweeny.start(this.m_actionIntroShow, 'HoldAndSpinRoundOverlayView:IntroShow'); break;
      case EMode.Outro: tweeny.start(this.m_actionOutro, 'HoldAndSpinRoundOverlayView:Outro'); break;
      case EMode.None: // fallthrough
      default: break;
    }
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    // intro animation
    {
      const pivot = this.m_elementsList.Get(DummyPivotId).GetWorldPivot();
      this.m_elementsList.SetWorldPivot(pivot, ElementsBonusIds);

      const actionDelayText = tweeny.delay(ShowTextDelay, this.m_sentinel);
      const actionsZoomIn: tweeny.tween_action[] = [];
      for (const id of ElementsBonusIds) {
        const elementIntro = this.m_elementsList.Find(id, BaseElement);
        if (elementIntro) {
          actionsZoomIn.push(ZoomIn(elementIntro, ElementZoomInDuration, ZoomInEasing));
        }
      }
      const actionZoomIn = tweeny.together(actionsZoomIn, this.m_sentinel);
      actionZoomIn.on_begin.connect(() => {
        const flashSpins = this.m_elementsList.Get(AnimBonusId, AnimElement);
        flashSpins.Stop();
        flashSpins.Rewind();
        this.m_elementsList.SetHidden(false, ElementsBonusIds);
      });
      actionZoomIn.on_end.connect(() => {
        this.m_events.introMidway.Post();
        this.m_elementsList.Get(AnimBonusId, AnimElement).Play();
      });

      const loopUntilStartIsPressed = tweeny.repeat(this.m_actionDummy, this.m_sentinel, 0);
      this.m_actionIntroShow = tweeny.together(
        [tweeny.sequence([actionDelayText, actionZoomIn], this.m_sentinel), loopUntilStartIsPressed], this.m_sentinel);
      this.m_actionIntroShow.on_begin.connect(() => {
        this.HideMembers();
        this.m_elementsList.SetColor(ColorSolid, ElementsAllIds);

        const animBackground = this.m_elementsList.Get(AnimBackgroundId, AnimElement);
        animBackground.Stop();
        animBackground.Rewind();
        animBackground.Play();
        animBackground.SetHidden(false);
      });

      // hide
      const actionsFadeOut: tweeny.tween_action[] = [];
      for (const id of ElementsAllIds) {
        const elementFadeOut = this.m_elementsList.Find(id, BaseElement);
        if (elementFadeOut) {
          actionsFadeOut.push(ColorTo(elementFadeOut, ColorTransparent, ElementFadeOutDuration));
        }
      }
      actionsFadeOut.push(tweeny.delay(HoldAndSpinInfoViewIntroAnimationDuration));
      this.m_actionIntroHide = tweeny.together(actionsFadeOut, this.m_sentinel);
      this.m_actionIntroHide.on_end.connect(() => {
        this.HideMembers();
        this.m_elementsList.SetColor(ColorSolid, ElementsAllIds);

        this.m_events.introFinished.Post();
      });
    }

    // outro animation
    {
    }
  }

  private HideMembers() {
    if (!this.m_elementsList.IsLoaded()) return;

    this.m_elementsList.SetHidden(true, ElementsAllIds);
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

  // IHoldAndSpinRoundOverlayView
  ShowIntro() {
    tweeny.start(this.m_actionIntroShow, 'HoldAndSpinRoundOverlayView:IntroShow');

    this.m_mode = EMode.Intro;
  }

  HideIntro() {
    tweeny.stop_and_finish(this.m_actionIntroShow);
    tweeny.start(this.m_actionIntroHide, 'HoldAndSpinRoundOverlayView:IntroHide');
  }

  ShowOutro() {
    tweeny.start(this.m_actionOutro, 'HoldAndSpinRoundOverlayView:Outro');

    this.m_mode = EMode.Outro;
  }

  Clear() {
    this.HideMembers();

    this.m_mode = EMode.None;
  }

  SetHoldAndSpinBannerVisible(isVisible: boolean) {
    if (this.m_isBannerVisible === isVisible) return;

    this.m_isBannerVisible = isVisible;
    this.m_isDirty = true;
  }

  Process() {
    super.Process();

    if (Unless(this.m_isDirty)) return;

    const flashSpinBanner = this.m_elementsList.TryGet(ImageFlashSpinId, ImageElement);
    if (flashSpinBanner) {
      flashSpinBanner.SetHidden(!this.m_isBannerVisible);
      this.m_isDirty = false;
    }
  }
}
