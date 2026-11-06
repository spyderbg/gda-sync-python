// Egt::Game::AlphaFamily::HoldAndSpinRoundOverlayView (NordicRushView/Views/HoldAndSpinRoundOverlayView.h/.cpp): the hold
// and spin round's intro (its background, then the bonus banner zooming in around dummy_pivot while 'press start'
// pulses, until START hides it), the free spins it won (a comet, then "N" or "+N" zooming in, faded out), its outro (the
// screen fades to black and back), and the flash spin banner.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { RemapClamped } from '@game/engine/GameCore/Common/Interpolation';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import type { Color } from '@game/engine/Game/RuntimeExport/IResources';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { float } from '@game/engine/GameCore/Common/Types';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ColorTo, FadeIn, FadeOut, PlaceholderFromTo, ZoomIn } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ThemeType } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IThemeView';
import {
  HoldAndSpinRoundOverlayTheme, IHoldAndSpinRoundOverlayView, IHoldAndSpinRoundOverlayViewEvents,
} from '@game/alpha_family/libs/AlphaFamily/Views/IHoldAndSpinRoundOverlayView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const HoldAndSpinRoundOverlayViewId = 'HoldAndSpinRoundOverlayView';

const DummyPivotId = 'dummy_pivot';

const AnimBackgroundId = 'anim_background';
const AnimBonusId = 'anim_bonus';
const ImageBonusPrizeFeatureId = 'image_bonus_prize_feature';
const ImagePressStartId = 'image_press_start';
const ImageFlashSpinId = 'image_flash_spin';
const ImageOutroOverlayId = 'image_outro_overlay';
const ElementsBonusIds = [
  AnimBonusId, ImageBonusPrizeFeatureId, ImagePressStartId];
// the banner is left out: only SetHoldAndSpinBannerVisible controls it
const ElementsSplashIds = [
  AnimBackgroundId, AnimBonusId, ImageBonusPrizeFeatureId, ImagePressStartId];

const DummyPivotFsRewardId = 'dummy_pivot_fs_reward';
const DummyPivotFsRewardWonId = 'dummy_pivot_fs_reward_won';
const ImageFsRewardAdditionalBannerId =
  'image_fs_reward_additional_banner';
const TextFsRewardAdditionalCountId = 'text_fs_reward_additional_count';
const ImageFsRewardWonBannerId = 'image_fs_reward_won_banner';
const TextFsRewardWonCountId = 'text_fs_reward_won_count';
const AnimFsRewardCometFlightId = 'anim_fs_reward_comet_flight';
const AnimFsRewardCometFlightStartId =
  'anim_fs_reward_comet_flight_start';
const AnimFsRewardCometFlightEndId = 'anim_fs_reward_comet_flight_end';
const ElementsFsRewardAdditionalTextIds = [
  ImageFsRewardAdditionalBannerId, TextFsRewardAdditionalCountId];
const ElementsFsRewardWonTextIds = [
  ImageFsRewardWonBannerId, TextFsRewardWonCountId];
const ElementsFsRewardFadeIds = [
  AnimBackgroundId,
  ImageFsRewardAdditionalBannerId,
  TextFsRewardAdditionalCountId,
  ImageFsRewardWonBannerId,
  TextFsRewardWonCountId,
  AnimFsRewardCometFlightId];

const SoundCometExplodeId = 'COMMET_EXPLODE_SOUND';
const SoundAdditionalSpinsId = 'WS_FAST_SPLASH_RETRIG';

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const ShowTextDelay: tweeny.duration_t = 22 * FrameDuration;
const ElementZoomInDuration: tweeny.duration_t = FrameDuration * 11; // 5frames * 41ms;
const PressStartBlinkHalfDuration: tweeny.duration_t = 400;
const OutroFadeInDuration: tweeny.duration_t = 500;
const OutroFadeOutDuration: tweeny.duration_t = 500;
const FsRewardCometFlightDuration: tweeny.duration_t = 18 * FrameDuration;
const FsRewardCometFlightAnimationDuration: tweeny.duration_t = 36 * FrameDuration;
const FsRewardTextVisibleDuration: tweeny.duration_t = 3000;
const FsRewardSplashFadeOutDuration: tweeny.duration_t = 2000;

const ColorSolid: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0xFF };
const ColorTransparent: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 0x00 };
const ColorPressStartDimmed: Color = { r: 0xFF, g: 0xFF, b: 0xFF, a: 100 };

function SineInOut(p: float): float {
  // C++: 0.5f - 0.5f * std::cos(std::numbers::pi_v<float> * p), tweeny's half sine wave
  return tweeny.ease.smooth_start_stop(p);
}

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
  BlackScreenOutro,
  FreeSpinsRewardSplash,
}

export class HoldAndSpinRoundOverlayView extends BaseView implements IHoldAndSpinRoundOverlayView {
  protected readonly m_events = new IHoldAndSpinRoundOverlayViewEvents();

  private m_sentinel = new sentinel();

  private m_actionDummy = new tweeny.tween_action();
  private m_actionIntroShow = new tweeny.tween_action();
  private m_actionBlackScreenOutro = new tweeny.tween_action();
  private m_actionFreeSpinsRewardAdditionalSpins = new tweeny.tween_action();
  private m_actionFreeSpinsRewardSpinsWon = new tweeny.tween_action();

  private m_mode = EMode.None;
  // m_theme in C++, where it hides BaseView's
  private m_overlayTheme = HoldAndSpinRoundOverlayTheme.FreeSpinsWon;
  private m_rewardedAmount = 0;
  private m_rewardCurrencyType: CurrencyType = Currency.FreeSpinEnergy;
  private m_hasRewardedAmount = false;

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
    tweeny.stop(this.m_actionBlackScreenOutro);
    tweeny.stop(this.m_actionFreeSpinsRewardAdditionalSpins);
    tweeny.stop(this.m_actionFreeSpinsRewardSpinsWon);
    this.DeinitElementsList();

    this.RuntimeRemove(IHoldAndSpinRoundOverlayView);
    this.RuntimeRemove(IHoldAndSpinRoundOverlayView.Events);

    super.Deinit();
  }

  private OnElementsListLoaded() {
    // adjust values
    this.HideMembers();
    this.m_isDirty = true;
    this.InitAnimations();

    // adjust animations
    switch (this.m_mode) {
      case EMode.Intro: tweeny.start(this.m_actionIntroShow, 'HoldAndSpinRoundOverlayView:IntroShow'); break;
      case EMode.BlackScreenOutro:
        tweeny.start(this.m_actionBlackScreenOutro, 'HoldAndSpinRoundOverlayView:BlackScreenOutro');
        break;
      case EMode.FreeSpinsRewardSplash:
        this.UpdateRewardSplashText();
        if (this.m_overlayTheme === HoldAndSpinRoundOverlayTheme.FreeSpinsAdditionalSpins) {
          tweeny.start(this.m_actionFreeSpinsRewardAdditionalSpins, 'HoldAndSpinRoundOverlayView:AdditionalSpins');
        } else {
          tweeny.start(this.m_actionFreeSpinsRewardSpinsWon, 'HoldAndSpinRoundOverlayView:SpinsWon');
        }
        break;
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

      const introSteps: tweeny.tween_action[] = [actionDelayText, actionZoomIn];
      const pressStart = this.m_elementsList.Find(ImagePressStartId, BaseElement);
      if (pressStart) {
        const blink = tweeny.sequence(
          [ColorTo(pressStart, ColorPressStartDimmed, PressStartBlinkHalfDuration, SineInOut),
            ColorTo(pressStart, ColorSolid, PressStartBlinkHalfDuration, SineInOut)],
          this.m_sentinel);
        introSteps.push(tweeny.repeat(blink, this.m_sentinel, 0));
      }

      const loopUntilStartIsPressed = tweeny.repeat(this.m_actionDummy, this.m_sentinel, 0);
      this.m_actionIntroShow =
        tweeny.together([tweeny.sequence(introSteps, this.m_sentinel), loopUntilStartIsPressed], this.m_sentinel);
      this.m_actionIntroShow.on_begin.connect(() => {
        this.HideMembers();

        const animBackground = this.m_elementsList.Get(AnimBackgroundId, AnimElement);
        animBackground.Stop();
        animBackground.Rewind();
        animBackground.Play();
        animBackground.SetHidden(false);
      });
    }

    // outro animation
    {
      const outroOverlay = this.m_elementsList.Find(ImageOutroOverlayId, ImageElement);

      const actionFadeIn = FadeIn(outroOverlay, OutroFadeInDuration);
      actionFadeIn.on_begin.connect(() => {
        this.m_elementsList.Get(ImageOutroOverlayId, ImageElement).SetHidden(false);
      });
      actionFadeIn.on_end.connect(() => {
        this.m_events.outroMidway.Post();
      });

      const actionFadeOut = FadeOut(outroOverlay, OutroFadeOutDuration);
      actionFadeOut.on_end.connect(() => {
        this.m_elementsList.Get(ImageOutroOverlayId, ImageElement).SetHidden(true);
        this.m_mode = EMode.None;
        this.m_events.outroFinished.Post();
      });

      this.m_actionBlackScreenOutro = tweeny.sequence([actionFadeIn, actionFadeOut], this.m_sentinel);
    }

    this.InitFreeSpinsRewardSplashAnimations();
  }

  private InitFreeSpinsRewardSplashAnimations() {
    const makeFreeSpinsRewardSplashAction = (pivotId: string,
      textElementIds: string[],
      playAdditionalSpinsSound: boolean) => {
      const pivot = this.m_elementsList.Get(pivotId).GetWorldPivot();
      this.m_elementsList.SetWorldPivot(pivot, textElementIds);

      const animCometFlight = this.m_elementsList.Find(AnimFsRewardCometFlightId, AnimElement);
      const animCometFlightStart = this.m_elementsList.Find(AnimFsRewardCometFlightStartId, AnimElement);
      const animCometFlightEnd = this.m_elementsList.Find(AnimFsRewardCometFlightEndId, AnimElement);
      const actionCometFlight = tweeny.together(
        [tweeny.delay(FsRewardCometFlightAnimationDuration),
          PlaceholderFromTo(
            animCometFlight, animCometFlightStart, animCometFlightEnd, FsRewardCometFlightDuration)],
        this.m_sentinel);
      actionCometFlight.on_begin.connect(() => {
        const animComet = this.m_elementsList.Get(AnimFsRewardCometFlightId, AnimElement);
        animComet.Stop();
        animComet.Rewind();
        animComet.Play();
        animComet.SetHidden(false);
      });
      actionCometFlight.on_end.connect(() => {
        this.m_elementsList.Get(AnimFsRewardCometFlightId, AnimElement).SetHidden(true);
      });

      const actionsZoomIn: tweeny.tween_action[] = [];
      for (const id of textElementIds) {
        const elementZoomIn = this.m_elementsList.Find(id, BaseElement);
        if (elementZoomIn) {
          actionsZoomIn.push(ZoomIn(elementZoomIn, ElementZoomInDuration, ZoomInEasing));
        }
      }
      const actionZoomIn = tweeny.together(actionsZoomIn, this.m_sentinel);
      actionZoomIn.on_begin.connect(() => {
        this.m_elementsList.SetHidden(false, textElementIds);
        const audioApi = this.RuntimeTryGet(IAudioApi);
        if (audioApi) {
          audioApi.Play(SoundCometExplodeId);
          if (playAdditionalSpinsSound) {
            audioApi.Play(SoundAdditionalSpinsId);
          }
        }
      });

      const actionFinishedDelay = tweeny.delay(FsRewardTextVisibleDuration, this.m_sentinel);

      const actionsFadeOut: tweeny.tween_action[] = [];
      for (const id of ElementsFsRewardFadeIds) {
        const elementFadeOut = this.m_elementsList.Find(id, BaseElement);
        if (elementFadeOut) {
          actionsFadeOut.push(
            ColorTo(elementFadeOut, ColorTransparent, FsRewardSplashFadeOutDuration));
        }
      }
      const actionFadeOut = tweeny.together(actionsFadeOut, this.m_sentinel);
      const actionFadeMidway = tweeny.delay(FsRewardSplashFadeOutDuration / 2, this.m_sentinel);
      actionFadeMidway.on_end.connect(() => {
        this.m_events.outroMidway.Post();
      });

      const actionDelayText = tweeny.delay(FsRewardCometFlightDuration, this.m_sentinel);

      const action = tweeny.together(
        [actionCometFlight,
          tweeny.sequence(
            [actionDelayText,
              actionZoomIn,
              actionFinishedDelay,
              tweeny.together([actionFadeMidway, actionFadeOut], this.m_sentinel)],
            this.m_sentinel)],
        this.m_sentinel);
      action.on_begin.connect(() => {
        this.m_elementsList.SetHidden(
          true, ElementsFsRewardAdditionalTextIds);
        this.m_elementsList.SetHidden(true, ElementsFsRewardWonTextIds);
        this.m_elementsList.SetHidden(true, [AnimFsRewardCometFlightId]);
        this.m_elementsList.SetColor(ColorSolid, ElementsFsRewardFadeIds);

        const animBackground = this.m_elementsList.Get(AnimBackgroundId, AnimElement);
        animBackground.Stop();
        animBackground.Rewind();
        animBackground.Play();
        animBackground.SetHidden(false);
      });
      action.on_end.connect(() => {
        this.m_elementsList.SetHidden(
          true, ElementsFsRewardAdditionalTextIds);
        this.m_elementsList.SetHidden(true, ElementsFsRewardWonTextIds);
        this.m_elementsList.SetHidden(true, [AnimFsRewardCometFlightId]);
        this.m_elementsList.Get(AnimBackgroundId, AnimElement).SetHidden(true);
        this.m_mode = EMode.None;
        this.m_events.outroFinished.Post();
      });
      return action;
    };

    this.m_actionFreeSpinsRewardAdditionalSpins =
      makeFreeSpinsRewardSplashAction(DummyPivotFsRewardId, ElementsFsRewardAdditionalTextIds, true);
    this.m_actionFreeSpinsRewardSpinsWon =
      makeFreeSpinsRewardSplashAction(DummyPivotFsRewardWonId, ElementsFsRewardWonTextIds, false);
  }

  private HideMembers() {
    if (!this.m_elementsList.IsLoaded()) return;

    this.m_elementsList.SetHidden(true, ElementsSplashIds);
    this.m_elementsList.SetColor(ColorSolid, ElementsSplashIds);
    this.m_elementsList.SetHidden(
      true, ElementsFsRewardAdditionalTextIds);
    this.m_elementsList.SetHidden(true, ElementsFsRewardWonTextIds);
    this.m_elementsList.SetHidden(true, [AnimFsRewardCometFlightId]);
    this.m_elementsList.Get(ImageOutroOverlayId, ImageElement).SetHidden(true);
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
    tweeny.stop(this.m_actionIntroShow);
    this.HideMembers();

    this.m_mode = EMode.None;
    this.m_events.introFinished.Post();
  }

  ShowOutro() {
    tweeny.start(this.m_actionBlackScreenOutro, 'HoldAndSpinRoundOverlayView:BlackScreenOutro');

    this.m_mode = EMode.BlackScreenOutro;
  }

  Clear() {
    tweeny.stop(this.m_actionFreeSpinsRewardAdditionalSpins);
    tweeny.stop(this.m_actionFreeSpinsRewardSpinsWon);
    this.HideMembers();

    this.m_mode = EMode.None;
    this.m_hasRewardedAmount = false;
  }

  SetRewardedAmount(rewarded: number, currencyType: CurrencyType) {
    this.m_rewardedAmount = rewarded;
    this.m_rewardCurrencyType = currencyType;
    this.m_hasRewardedAmount = true;
    this.UpdateRewardSplashText();
  }

  // C++'s SetTheme(HoldAndSpinRoundOverlayTheme) hides BaseView's SetTheme(ThemeType), which no one calls on this view;
  // TypeScript cannot hide it, so the parameter takes both
  SetTheme(theme: HoldAndSpinRoundOverlayTheme | ThemeType) {
    this.m_overlayTheme = theme as HoldAndSpinRoundOverlayTheme;
    this.ShowRewardSplash();
  }

  private ShowRewardSplash() {
    if (Unless(this.m_hasRewardedAmount)) return;

    this.m_mode = EMode.FreeSpinsRewardSplash;
    this.UpdateRewardSplashText();

    if (!this.m_elementsList.IsLoaded()) {
      return;
    }

    if (this.m_overlayTheme === HoldAndSpinRoundOverlayTheme.FreeSpinsAdditionalSpins) {
      tweeny.start(this.m_actionFreeSpinsRewardAdditionalSpins, 'HoldAndSpinRoundOverlayView:AdditionalSpins');
    } else {
      tweeny.start(this.m_actionFreeSpinsRewardSpinsWon, 'HoldAndSpinRoundOverlayView:SpinsWon');
    }
  }

  private UpdateRewardSplashText() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    if (this.m_overlayTheme === HoldAndSpinRoundOverlayTheme.FreeSpinsAdditionalSpins) {
      this.m_elementsList.Get(TextFsRewardAdditionalCountId, TextElement).SetText(`+${this.m_rewardedAmount}`);
    } else {
      this.m_elementsList.Get(TextFsRewardWonCountId, TextElement).SetText(`${this.m_rewardedAmount}`);
    }
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
