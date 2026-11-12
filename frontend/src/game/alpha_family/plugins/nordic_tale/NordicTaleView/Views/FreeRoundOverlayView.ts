// Egt::Game::AlphaFamily::FreeRoundOverlayView (NordicTaleView/Views/FreeRoundOverlayView.h/.cpp): the free round's
// outro (a comet flies across, then the total win zooms in around dummy_pivot, in credits, coins or a number), over its
// background, held three seconds and faded out. Its intro has no animation.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AssertUnless, Unless } from '@game/engine/GameCore/Common/Defensive';
import { RemapClamped } from '@game/engine/GameCore/Common/Interpolation';
import type { CurrencyType } from '@game/engine/Game/Math/Common.data';
import type { Color } from '@game/engine/Game/RuntimeExport/IResources';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { float } from '@game/engine/GameCore/Common/Types';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { BaseElement } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ColorTo, PlaceholderFromTo, ZoomIn } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { Currency } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
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

const ImageOutroTotalWinId = 'image_outro_total_win';
const TextOutroTotalWinId = 'text_outro_total_win';
const ElementsOutroTextIds = [
  ImageOutroTotalWinId, TextOutroTotalWinId];
const ElementsOutroAllIds = [
  AnimBackgroundId, ImageOutroTotalWinId, TextOutroTotalWinId, AnimIntroCometFlightId];

const SoundCometExplodeId = 'COMMET_EXPLODE_SOUND';

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const IntroCometFlightDuration: tweeny.duration_t = 18 * FrameDuration;
const IntroCometFlightAnimationDuration: tweeny.duration_t = 36 * FrameDuration;
const ElementZoomInDuration: tweeny.duration_t = FrameDuration * 11; // 5frames * 41ms;
const ElementFinishedDelay: tweeny.duration_t = 3000;
const ElementFadeOutDuration: tweeny.duration_t = 2000;

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
  Outro,
}

export class FreeRoundOverlayView extends BaseView implements IFreeRoundOverlayView {
  protected readonly m_events = new IFreeRoundOverlayViewEvents();

  private m_sentinel = new sentinel();
  private m_actionOutro = new tweeny.tween_action();

  private m_mode = EMode.None;
  private m_outroReward = 0;
  private m_outroCurrencyType: CurrencyType = Currency.Credits;

  constructor() {
    super(FreeRoundOverlayViewId);
  }

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
    tweeny.stop(this.m_actionOutro);

    this.DeinitElementsList();

    this.RuntimeRemove(IFreeRoundOverlayView);
    this.RuntimeRemove(IFreeRoundOverlayView.Events);

    super.Deinit();
  }

  private OnElementsListLoaded() {
    this.HideMembers();
    this.InitAnimations();

    this.AdjustOutroText();

    switch (this.m_mode) {
      case EMode.Outro: tweeny.start(this.m_actionOutro, 'FreeRoundOverlayView:Outro'); break;
      case EMode.None: // fallthrough
      default: break;
    }
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    const makeCometFlight = () => {
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
      });
      actionCometFlight.on_end.connect(() => {
        const animCometFlight = this.m_elementsList.Get(AnimIntroCometFlightId, AnimElement);
        animCometFlight.SetHidden(true);
      });
      return actionCometFlight;
    };

    // outro animation
    {
      const actionCometFlight = makeCometFlight();

      const pivot = this.m_elementsList.Get(DummyPivotId).GetWorldPivot();
      this.m_elementsList.SetWorldPivot(pivot, ElementsOutroTextIds);

      const actionDelayText = tweeny.delay(IntroCometFlightDuration, this.m_sentinel);
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
        const audioApi = this.RuntimeTryGet(IAudioApi);
        if (audioApi) {
          audioApi.Play(SoundCometExplodeId);
        }
      });
      actionElementsZoomIn.on_end.connect(() => {
        this.m_events.outroMidway.Post();
      });

      const actionFinishedDelay = tweeny.delay(ElementFinishedDelay, this.m_sentinel);

      const actionsFadeOut: tweeny.tween_action[] = [];
      for (const id of ElementsOutroAllIds) {
        const elementFadeOut = this.m_elementsList.Find(id, BaseElement);
        if (elementFadeOut) {
          actionsFadeOut.push(ColorTo(elementFadeOut, ColorTransparent, ElementFadeOutDuration));
        }
      }
      const actionFadeOut = tweeny.together(actionsFadeOut, this.m_sentinel);

      this.m_actionOutro = tweeny.together(
        [actionCometFlight,
          tweeny.sequence([actionDelayText, actionElementsZoomIn, actionFinishedDelay, actionFadeOut], this.m_sentinel)],
        this.m_sentinel);
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
        this.m_mode = EMode.None;
        this.m_events.outroFinished.Post();
      });
    }
  }

  private HideMembers() {
    if (!this.m_elementsList.IsLoaded()) return;

    this.m_elementsList.SetHidden(
      true,
      [AnimBackgroundId,
        ImageIntroFsWonId,
        TextIntroFsWonId,
        ImageOutroTotalWinId,
        TextOutroTotalWinId,
        AnimIntroCometFlightId]);
  }

  private AdjustOutroText() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const totalWinText = this.m_elementsList.Get(TextOutroTotalWinId, TextElement);
    const localization = this.RuntimeGetConst(ILocalization);
    let formatted: string;
    if (this.m_outroCurrencyType === Currency.Credits) {
      formatted = localization.FormatCurrency(this.m_outroReward);
    } else if (this.m_outroCurrencyType === Currency.CoinsSpinEnergy) {
      formatted = localization.FormatCoins(this.m_outroReward);
    } else {
      formatted = localization.FormatNumber(this.m_outroReward);
    }
    totalWinText.SetText(formatted);
  }

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

  ShowIntro() {
    this.m_events.introMidway.Post();
    this.m_events.introFinished.Post();
  }

  ShowOutro() {
    this.m_mode = EMode.Outro;

    this.AdjustOutroText();
    if (Unless(this.m_elementsList.IsLoaded())) return;

    tweeny.start(this.m_actionOutro, 'FreeRoundOverlayView:Outro');
  }

  Clear() {
    tweeny.stop(this.m_actionOutro);
    this.HideMembers();
    this.m_mode = EMode.None;
  }

  SetRewardedAmount(rewarded: number, currencyType: CurrencyType) {
    if (this.m_outroReward === rewarded && this.m_outroCurrencyType === currencyType) return;
    this.m_outroReward = rewarded;
    this.m_outroCurrencyType = currencyType;
    this.AdjustOutroText();
  }

  SetFreeSpinsRewarded(_rewarded: number) {
  }
}
