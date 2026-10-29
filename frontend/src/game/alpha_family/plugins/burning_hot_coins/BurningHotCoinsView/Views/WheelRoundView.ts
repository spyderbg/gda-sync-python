// Egt::Game::AlphaFamily::WheelRoundView (BurningHotCoinsView/Views/WheelRoundView.h/.cpp): the coins wheel: its four
// sectors with their wins (vertical texts), which speed up, spin and slow down to the stop sector, the blinking arrows
// while it waits, and the win sector's intro, effect and cycle.

import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { type Color, IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { assert, Unless } from '@game/engine/GameCore/Common/Defensive';
import { RemapClamped } from '@game/engine/GameCore/Common/Interpolation';
import { type float, type int, type int64_t, type size_t, static_cast } from '@game/engine/GameCore/Common/Types';
import { EgtALogCategoryClass } from '@game/engine/GameCore/Log/LogCategory';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BrowserOnly } from '@game/engine/GameCore/Common/BrowserOnly';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ImageElement } from '@game/engine/GameVideoCtrl/ViewElements/ImageElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ColorFromTo, RotateFromTo } from '@game/engine/GameVideoCtrl/ViewElements/TweenyExtend/TweenyExtendElement';
import { make_sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IWheelRoundView, IWheelRoundViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IWheelRoundView.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import type { WheelRoundViewConfig } from './WheelRoundView.data';

const Pi: float = Math.PI;
const Pi2: float = Pi * (2.0 as float);
const HalfPi: float = Pi / (2.0 as float);
const CircleDegrees: float = 360 as float;
const FrameDuration = 1000 / 33; // 1frames * 41ms;

const WheelRoundViewId = 'WheelRoundView';

const WinWheelMaskId = 'image_wheel_winning_mask';
const WinWheelFxId = 'anim_wheel_winning_fx';
const WinWheelStarsId = 'anim_wheel_winning_stars';
const WinSectorIntroAnimId = 'anim_win_sector_intro';
const WinSectorCycleAnimId = 'anim_win_sector_cycle';

const LeftArrowImageUnlitId = 'image_left_arrow_unlit';
const LeftArrowImageLitId = 'image_left_arrow_lit';
const RightArrowImageUnlitId = 'image_right_arrow_unlit';
const RightArrowImageLitId = 'image_right_arrow_lit';

const BackgroundSoundId = 'SOUND_LOOP_WHEEL_BACKGROUND';
const StartSpinSoundId = 'SOUND_WHEEL_START_SPIN';
const ShowWinSoundId = 'SOUND_WHEEL_SHOW_WIN';
const SectorSpinSoundId = 'SOUND_WHEEL_SECTOR';

const ImageWheelPivotOwnerId = 'image_wheel_base';
const ImageSectorIds = [
  'image_sector_1', 'image_sector_2', 'image_sector_3', 'image_sector_4'];

const TextSectorIds = [
  'text_sector_1', 'text_sector_2', 'text_sector_3', 'text_sector_4'];

// C++: struct { const std::array<float, 9> soundDegreesIntervals; } config
const soundDegreesIntervals: float[] = [
  0.0,
  CircleDegrees / 8.0,
  2 * CircleDegrees / 8.0,
  3 * CircleDegrees / 8.0,
  4 * CircleDegrees / 8.0,
  5 * CircleDegrees / 8.0,
  6 * CircleDegrees / 8.0,
  7 * CircleDegrees / 8.0,
  CircleDegrees];

function CyclicSinInOutEasing(progress: float): float {
  const threshold: float = 0.5 as float; // ≈ 0.4545

  if (progress <= threshold) { // half sin wave
    const remappedProgress: float = RemapClamped(progress, 0 as float, threshold, 0 as float, 1.0 as float);
    const smoothedValue: float = tweeny.ease.smooth_start_stop(remappedProgress);
    return smoothedValue;
  } else { // 2nd half sin wave
    const remappedProgress: float = RemapClamped(progress, threshold, 1 as float, 0 as float, 1.0 as float);
    const smoothedValue: float = 1 - tweeny.ease.smooth_start_stop(remappedProgress);
    return smoothedValue;
  }
}

enum ESubstate {
  Invisible,
  Idle,
  SpinningSpeedUp,
  SpinningConstant,
  SpinningSlowDown,
  PresentWinIntro,
  PresentWinCycle,
  Outro,
}

export class WheelRoundView extends BaseView implements IWheelRoundView {
  protected readonly m_events = new IWheelRoundViewEvents();

  private m_substate = ESubstate.Invisible;
  private m_wheelRotationAbsoluteDegrees: float = 0.0;
  private m_sectorWinAmount: int64_t[] = [];

  private m_startSectorIndex: int = 0;
  private m_stopSectorIndex: int = 0;

  private m_sentinel = make_sentinel();

  private m_wheelAngle: float = 0.0;
  private m_slowDownStartAngle: float = 0.0;

  private m_actionSpinSpeedUp = new tweeny.tween_action();
  private m_actionSpinConstant = new tweeny.tween_action();
  private m_actionSpinSlowDown = new tweeny.tween_action();
  private m_actionButtonEnabled = new tweeny.tween_action();
  private m_actionWinFx = new tweeny.tween_action();

  private m_stopSpinningRequested = false;

  private m_lastSoundInterval: int = -1;
  private m_entryPlayback: IAudioPlayback | null = null;
  private m_backgroundPlayback: IAudioPlayback | null = null;

  private m_config!: WheelRoundViewConfig;

  constructor() {
    super(WheelRoundViewId);
  }

  // BaseView
  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IWheelRoundView, this);
    this.RuntimeAdd(IWheelRoundView.Events, this.m_events);

    this.RuntimeGet(IAudioApi.Events).playbackStarted.RegisterInstant(
      this, (name: string, playback: IAudioPlayback) => {
        if (name === 'SOUND_WHEEL_TAKE_COINS_BUTTON_CLICKED') {
          this.m_entryPlayback = playback;
        }
      });

    this.InitElementsList(WheelRoundViewId, () => {
      this.OnElementsListLoaded();
    });

    // wheel reel animation
    const millisecondsToStart = 200;
    const constDegreesPerMillisecond: float = 0.43 as float;
    const factor: float = 0.5 as float; // magic number?
    const spinSpeedUpTargetAngle: float = factor * millisecondsToStart * constDegreesPerMillisecond;

    const spinConstStartAngle: float = spinSpeedUpTargetAngle;
    const spinConstCycleTime = static_cast<int64_t>(CircleDegrees / constDegreesPerMillisecond);
    const spinConstTargetAngle: float = spinConstStartAngle + CircleDegrees * 1;

    const spinSlowDownTargetTime = 2900;

    this.m_sentinel = make_sentinel();

    this.m_wheelAngle = this.GetStartSectorAngle();
    this.m_actionSpinSpeedUp =
      tweeny.tween_from_to(tweeny.ref(this, 'm_wheelAngle'), 0.0, 1.0, millisecondsToStart, this.m_sentinel, tweeny.ease.smooth_start);
    this.m_actionSpinSpeedUp.on_begin.connect(() => {
      this.m_events.spinningStarted.Post();
    });
    {
      const targetAngle = spinSpeedUpTargetAngle;
      this.m_actionSpinSpeedUp.on_update.connect(() => {
        const offsetAngle: float = this.GetStartSectorAngle();
        const angle: float = RemapClamped(this.m_wheelAngle, 0 as float, 1 as float, offsetAngle, targetAngle + offsetAngle);
        this.SetWheelRotationAbsolute(angle);
        this.UpdateLastSoundInterval();
      });
    }
    this.m_actionSpinSpeedUp.on_end.connect(() => {
      if (this.m_stopSpinningRequested) {
        this.SetSubstate(ESubstate.SpinningSlowDown);
      } else {
        this.SetSubstate(ESubstate.SpinningConstant);
      }
    });

    const actionSpinConstantCycle = tweeny.tween_from_to(
      tweeny.ref(this, 'm_wheelAngle'), spinConstStartAngle, spinConstTargetAngle, spinConstCycleTime, this.m_sentinel, tweeny.ease.linear);
    actionSpinConstantCycle.on_update.connect(() => {
      const offsetAngle: float = this.GetStartSectorAngle();
      this.SetWheelRotationAbsolute(this.m_wheelAngle + offsetAngle);
      this.UpdateLastSoundInterval();
    });
    this.m_actionSpinConstant = tweeny.repeat(actionSpinConstantCycle, this.m_sentinel);

    this.m_actionSpinSlowDown =
      tweeny.tween_from_to(tweeny.ref(this, 'm_wheelAngle'), 0.0, 1.0, spinSlowDownTargetTime, this.m_sentinel, tweeny.ease.smooth_stop);
    {
      const milisecondsToStop = spinSlowDownTargetTime;
      this.m_actionSpinSlowDown.on_update.connect(() => {
        // Continue from the angle captured when SlowDown started (no Constant->SlowDown jump).
        const offset1: float = this.m_slowDownStartAngle;
        const stoppingAngle: float = this.GetStopSectorAngle();
        const offset2: float = milisecondsToStop * constDegreesPerMillisecond * 0.5;
        const remainder: float = (offset1 + offset2) % CircleDegrees;
        const targetCompensation: float = offset2 + (stoppingAngle - remainder) * this.m_wheelAngle;
        // t=0 -> offset1; t=1 -> stoppingAngle + k*360
        const angle: float = offset1 + targetCompensation * this.m_wheelAngle;
        this.SetWheelRotationAbsolute(angle);
        this.UpdateLastSoundInterval();
      });
    }
    this.m_actionSpinSlowDown.on_end.connect(() => {
      this.m_events.spinningFinished.Post();
    });

    this.LoadConfig();
    // when its config's file changes, the sectors' wins are written again with it
    BrowserOnly(() => this.WatchConfig('WheelRoundViewConfig', () => this.ReloadConfig()));
    this.SetVisible(false);

    return true;
  }

  private OnElementsListLoaded() { // delayed init of the elements' list
    // from the init
    // blinking buttons animation
    const duration = 2000;
    const highlight: Color = { r: 255, g: 255, b: 255, a: 255 };
    const invisible: Color = { r: highlight.r, g: highlight.g, b: highlight.b, a: 0 };
    this.m_actionButtonEnabled = tweeny.repeat(tweeny.together(
      ColorFromTo(
        this.m_elementsList.Find(LeftArrowImageLitId, ImageElement), invisible, highlight, duration, CyclicSinInOutEasing),
      ColorFromTo(
        this.m_elementsList.Find(RightArrowImageLitId, ImageElement),
        invisible,
        highlight,
        duration,
        CyclicSinInOutEasing)));
    this.m_actionButtonEnabled.on_begin.connect(() => {
      this.m_elementsList.SetHidden(false, [LeftArrowImageLitId, RightArrowImageLitId]);
    });
    this.m_actionButtonEnabled.on_end.connect(() => {
      this.m_elementsList.SetHidden(true, [LeftArrowImageLitId, RightArrowImageLitId]);
    });

    // win fx animation
    const delayAfterWinAnim = tweeny.delay(150);
    if (this.m_elementsList.TryGet(WinWheelFxId, AnimElement)) {
      const rotateFx =
        RotateFromTo(this.m_elementsList.Find(WinWheelFxId, AnimElement), 0.0, -1 * CircleDegrees, 990);
      rotateFx.on_begin.connect(() => {
        const cometFx = this.m_elementsList.Get(WinWheelFxId, AnimElement);
        cometFx.Stop();
        cometFx.Rewind();
        cometFx.Play();
        cometFx.SetHidden(false);
      });
      rotateFx.on_end.connect(() => {
        this.m_elementsList.Get(WinWheelFxId, AnimElement).SetHidden(true);
      });
      this.m_actionWinFx = tweeny.sequence_precise(rotateFx, delayAfterWinAnim);
      this.m_actionWinFx.on_end.connect(() => {
        this.OnWinPresented();
      });
    } else if (this.m_elementsList.TryGet(WinWheelStarsId, AnimElement)) {
      const animWinWheelStars = tweeny.delay(68 * FrameDuration);
      animWinWheelStars.on_begin.connect(() => {
        const stars = this.m_elementsList.Get(WinWheelStarsId, AnimElement);
        stars.Stop();
        stars.Rewind();
        stars.Play();
        stars.SetHidden(false);
      });
      animWinWheelStars.on_end.connect(() => {
        this.m_elementsList.Get(WinWheelStarsId, AnimElement).SetHidden(true);
      });
      this.m_actionWinFx = tweeny.sequence_precise(animWinWheelStars, delayAfterWinAnim);
      this.m_actionWinFx.on_end.connect(() => {
        this.OnWinPresented();
      });
    }
    const wheelWorldPivot = this.m_elementsList.Get(ImageWheelPivotOwnerId, ImageElement).GetWorldPivot();
    this.m_elementsList.SetWorldPivot(wheelWorldPivot, ImageSectorIds);
    this.m_elementsList.SetWorldPivot(wheelWorldPivot, TextSectorIds);
    for (const textSectorId of TextSectorIds) {
      this.m_elementsList.Get(textSectorId, TextElement).SetCenterVerticalLayoutToFitBox(true);
    }
    // synch the data with the elements list
    this.OnSetSectorWins();
    this.AdjustSubstate();
    this.AdjustWheelRotationAbsolute();
    this.AdjustVisible();
  }

  Deinit() {
    this.RuntimeGet(IAudioApi.Events).playbackStarted.ForceUnregister(this);
    this.m_entryPlayback = null;

    this.RuntimeRemove(IWheelRoundView);
    this.RuntimeRemove(IWheelRoundView.Events);

    tweeny.stop(this.m_actionSpinSpeedUp);
    tweeny.stop(this.m_actionSpinConstant);
    tweeny.stop(this.m_actionSpinSlowDown);
    tweeny.stop(this.m_actionButtonEnabled);
    tweeny.stop(this.m_actionWinFx);

    this.DeinitElementsList();

    super.Deinit();
  }

  Process() {
    if (!this.m_control.m_enabled) return;

    super.Process();

    if (Unless(this.m_elementsList.IsLoaded())) return;
    if (this.m_control.m_visible && !this.m_backgroundPlayback && (!this.m_entryPlayback || !this.m_entryPlayback.IsPlaying())) {
      this.m_backgroundPlayback = this.RuntimeGet(IAudioApi).Play(BackgroundSoundId);
    }
    switch (this.m_substate) {
      case ESubstate.Invisible: break;
      case ESubstate.Idle: break;
      case ESubstate.SpinningSpeedUp: break;
      case ESubstate.SpinningConstant: break;
      case ESubstate.SpinningSlowDown: break;
      case ESubstate.PresentWinIntro:
        {
          if (!this.m_elementsList.Get(WinSectorIntroAnimId, AnimElement).IsPlaying()) {
            this.OnWinSectorIntroFinished();
          }
        }
        break;
      case ESubstate.PresentWinCycle: break;
      case ESubstate.Outro: // [[fallthrough]]
      default: break;
    }
  }

  IsOpaqueFullScreen() {
    return true && this.IsVisible();
  }

  // IControlView
  SetEnabled(enabled: boolean) {
    super.SetEnabled(enabled);
  }

  SetVisible(visible: boolean) {
    const old = this.m_control.m_visible;
    if (old === visible) return;

    this.m_control.SetVisible(visible);
    this.AdjustVisible();
  }

  SetFocused(focused: boolean) {
    super.SetFocused(focused);
  }

  SetSkin(skin: string) {
    super.SetSkin(skin);
  }

  private AdjustVisible() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    if (this.m_control.m_visible) {
      if (this.m_substate === ESubstate.Invisible) {
        this.SetSubstate(ESubstate.Idle);
      }

      this.m_lastSoundInterval = -1;
    } else {
      this.SetSubstate(ESubstate.Invisible);
    }
  }

  // IWheelRoundView
  SetSectorWins(sectorWinAmount: int64_t[], startSectorIndex: int) {
    this.m_sectorWinAmount = [...sectorWinAmount];
    this.m_startSectorIndex = startSectorIndex;

    this.OnSetSectorWins();
  }

  private OnSetSectorWins() {
    if (Unless(this.m_elementsList.IsLoaded())) return;
    this.SetSectorWinsText();
    this.SetWheelRotationAbsolute(this.GetStartSectorAngle());
  }

  StartSpinning() {
    const isAlreadySpinning: boolean = this.m_substate === ESubstate.SpinningSpeedUp ||
      this.m_substate === ESubstate.SpinningConstant || this.m_substate === ESubstate.SpinningSlowDown;
    if (isAlreadySpinning) return;
    this.m_stopSpinningRequested = false;
    this.SetSubstate(ESubstate.SpinningSpeedUp);
  }

  StopSpinning(sectorIndex: int) {
    this.m_stopSectorIndex = sectorIndex;
    this.m_stopSpinningRequested = true;

    if (this.m_substate === ESubstate.SpinningConstant) {
      this.SetSubstate(ESubstate.SpinningSlowDown);
    }
  }

  StartPresentingWin() {
    this.SetSubstate(ESubstate.PresentWinIntro);
  }

  Clear() {
    this.SetVisible(false);
  }

  private OnWinSectorIntroFinished() {
    this.SetSubstate(ESubstate.PresentWinCycle);
  }

  private SetSubstate(substate: ESubstate) {
    if (this.m_substate === substate) return;
    this.m_substate = substate;
    this.AdjustSubstate();
  }

  private AdjustSubstate() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const HideWinElements = () => {
      this.m_elementsList.Get(WinSectorIntroAnimId, AnimElement).SetHidden(true);
      this.m_elementsList.Get(WinSectorCycleAnimId, AnimElement).SetHidden(true);
      this.m_elementsList.Get(WinWheelMaskId, ImageElement).SetHidden(true);
      const winWheelFx = this.m_elementsList.TryGet(WinWheelFxId, AnimElement);
      if (winWheelFx) {
        winWheelFx.SetHidden(true);
      }
      const winWheelStars = this.m_elementsList.TryGet(WinWheelStarsId, AnimElement);
      if (winWheelStars) {
        winWheelStars.SetHidden(true);
      }
    };
    // start a win cycle
    switch (this.m_substate) {
      case ESubstate.Invisible:
        {
          tweeny.stop(this.m_actionSpinSpeedUp);
          tweeny.stop(this.m_actionSpinConstant);
          tweeny.stop(this.m_actionSpinSlowDown);
          tweeny.stop(this.m_actionButtonEnabled);
          tweeny.stop(this.m_actionWinFx);
          if (this.m_backgroundPlayback) {
            this.m_backgroundPlayback.Stop();
            this.m_backgroundPlayback = null;
          }
          HideWinElements();
          break;
        }
      case ESubstate.PresentWinCycle:
        {
          this.m_elementsList.Get(WinSectorIntroAnimId, AnimElement).SetHidden(true);
          this.m_elementsList.Get(WinSectorCycleAnimId, AnimElement).Rewind();
          this.m_elementsList.Get(WinSectorCycleAnimId, AnimElement).SetHidden(false);
          break;
        }
      case ESubstate.Outro:
        {
          const winWheelFx = this.m_elementsList.TryGet(WinWheelFxId, AnimElement);
          if (winWheelFx) {
            winWheelFx.SetHidden(true);
          }
          const winWheelStars = this.m_elementsList.TryGet(WinWheelStarsId, AnimElement);
          if (winWheelStars) {
            winWheelStars.SetHidden(true);
          }
          this.m_elementsList.Get(WinSectorIntroAnimId, AnimElement).SetHidden(true);
          this.m_elementsList.Get(WinSectorCycleAnimId, AnimElement).Rewind();
          this.m_elementsList.Get(WinSectorCycleAnimId, AnimElement).SetHidden(false);
          break;
        }
      case ESubstate.Idle:
        {
          if (!tweeny.is_running(this.m_actionButtonEnabled)) {
            tweeny.start(this.m_actionButtonEnabled, 'WheelRoundView:ButtonEnabled');
          }
          this.m_elementsList.Get(WinSectorIntroAnimId, AnimElement).SetHidden(true);
          this.m_elementsList.Get(WinSectorCycleAnimId, AnimElement).SetHidden(true);
          this.m_elementsList.Get(WinWheelMaskId, ImageElement).SetHidden(true);
          const winWheelFx = this.m_elementsList.TryGet(WinWheelFxId, AnimElement);
          if (winWheelFx) {
            winWheelFx.SetHidden(true);
          }
          const winWheelStars = this.m_elementsList.TryGet(WinWheelStarsId, AnimElement);
          if (winWheelStars) {
            winWheelStars.SetHidden(true);
          }
          break;
        }
      case ESubstate.PresentWinIntro:
        {
          // start win into anim
          const winSectorIntroAnim = this.m_elementsList.Get(WinSectorIntroAnimId, AnimElement);
          winSectorIntroAnim.Rewind();
          winSectorIntroAnim.SetHidden(false);

          this.m_elementsList.Get(WinWheelMaskId, ImageElement).SetHidden(false);

          if (this.m_elementsList.TryGet(WinWheelFxId, AnimElement)) {
            tweeny.start(this.m_actionWinFx, 'WheelRoundView:WinFx');
          } else if (this.m_elementsList.TryGet(WinWheelStarsId, AnimElement)) {
            tweeny.start(this.m_actionWinFx, 'WheelRoundView:WinAnimStars');
          }

          this.RuntimeGet(IAudioApi).Play(ShowWinSoundId);
          break;
        }
      case ESubstate.SpinningSpeedUp:
        {
          HideWinElements();
          tweeny.stop_and_finish(this.m_actionButtonEnabled);
          tweeny.stop(this.m_actionSpinConstant);
          tweeny.stop(this.m_actionSpinSlowDown);
          tweeny.start(this.m_actionSpinSpeedUp, 'WheelRoundView:SpinSpeedUp');

          this.RuntimeGet(IAudioApi).Play(StartSpinSoundId);
          break;
        }
      case ESubstate.SpinningConstant:
        {
          HideWinElements();
          tweeny.stop(this.m_actionSpinSpeedUp);
          tweeny.stop(this.m_actionSpinSlowDown);
          tweeny.start(this.m_actionSpinConstant, 'WheelRoundView:SpinConstant');
          break;
        }
      case ESubstate.SpinningSlowDown:
        {
          HideWinElements();
          tweeny.stop(this.m_actionSpinSpeedUp);
          tweeny.stop(this.m_actionSpinConstant);
          this.m_slowDownStartAngle = this.m_wheelRotationAbsoluteDegrees;
          tweeny.start(this.m_actionSpinSlowDown, 'WheelRoundView:SpinSlowDown');
          break;
        }
      default: break;
    }
  }

  private OnWinPresented() {
    this.SetSubstate(ESubstate.Outro);
    this.m_events.winPresentingFinished.Post();
  }

  ////////////////////////////////////////////////////////////////////////////////

  private SetWheelRotationAbsolute(absoluteDegrees: float) {
    this.m_wheelRotationAbsoluteDegrees = absoluteDegrees;
    this.AdjustWheelRotationAbsolute();
  }

  private AdjustWheelRotationAbsolute() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    const sectorsCount = this.m_sectorWinAmount.length; // TODO: read it from the config
    const delta: float = CircleDegrees / sectorsCount; // TODO: get from config
    for (let sectorIdx: size_t = 0; sectorIdx < sectorsCount; ++sectorIdx) {
      const sectorAngle: float = this.m_wheelRotationAbsoluteDegrees + delta * sectorIdx;
      this.m_elementsList.SetRotation(sectorAngle, [ImageSectorIds[sectorIdx], TextSectorIds[sectorIdx]]);
    }
  }

  private UpdateLastSoundInterval() {
    const currentAngle = (this.m_wheelRotationAbsoluteDegrees + CircleDegrees) % CircleDegrees;
    assert(0.0 <= currentAngle && currentAngle <= CircleDegrees);
    const intervals = soundDegreesIntervals;
    const it = intervals.findIndex(interval => interval > currentAngle); // std::upper_bound
    const end = it === -1 ? intervals.length : it;
    const currentInterval = end !== 0 ? static_cast<int>(end - 1) : -1;

    if (currentInterval === this.m_lastSoundInterval) return;
    this.m_lastSoundInterval = currentInterval;

    this.RuntimeGet(IAudioApi).Play(SectorSpinSoundId);
  }

  private GetStartSectorAngle(): float {
    const sectorCount = static_cast<int>(this.m_sectorWinAmount.length);
    const sectorDegrees: float = CircleDegrees / sectorCount;
    return (sectorCount - this.m_startSectorIndex) * sectorDegrees; // 90 = 360/ sectors_count
  }

  private GetStopSectorAngle(): float {
    const sectorCount = static_cast<int>(this.m_sectorWinAmount.length);
    const sectorDegrees: float = CircleDegrees / sectorCount;
    return (sectorCount - this.m_stopSectorIndex) * sectorDegrees; // 90 = 360/ sectors_count
  }

  private SetSectorWinsText() {
    for (let sectorIdx: size_t = 0; sectorIdx < this.m_sectorWinAmount.length; ++sectorIdx) {
      const sectorLabelId = TextSectorIds[sectorIdx];
      const sectorLabel = this.m_elementsList.Get(sectorLabelId, TextElement);

      const valueStr: string =
        this.RuntimeGetConst(ILocalization).FormatNumber(this.m_sectorWinAmount[sectorIdx]);
      sectorLabel.ResetCustomVerticalTextLineHeight().SetText(valueStr).SetCustomVerticalTextLineHeight(
        valueStr.length - 3, this.m_config.overrideVerticalTextCommaHeight);
    }
  }

  private LoadConfig() {
    const resources = this.RuntimeGet(IResources);
    this.m_config = resources.GetIData<WheelRoundViewConfig>('WheelRoundViewConfig');
  }

  /** Reads its config again, when its file changed, and writes the sectors' wins again with it.
   * @browserOnly */
  private ReloadConfig() {
    this.LoadConfig();
    if (this.m_elementsList.IsLoaded()) this.SetSectorWinsText();
  }
}

EgtALogCategoryClass(WheelRoundView, 'WheelRoundView');
