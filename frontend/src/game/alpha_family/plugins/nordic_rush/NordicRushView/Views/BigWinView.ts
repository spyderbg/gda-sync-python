// Egt::Game::AlphaFamily::BigWinView (NordicRushView/Views/BigWinView.h/.cpp): the big win's coins eruption
// animation, with its sound, and the major and grand prizes' animations with the prize (the info screen's FormatPrize).
// Once a prize's animation has faded in, the view covers the screen (IsOpaqueFullScreen) until it ends.

import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { make_sentinel, sentinel } from '@game/hat_libs/egt_hpp/sentinel';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { TextElement } from '@game/engine/GameVideoCtrl/ViewElements/TextElement';
import { ERoundTags } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { IBigWinView, IBigWinViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const BigWinViewId = 'BigWinView';

const SoundCoinsEruptionId = 'SOUND_BIG_WIN_COINS_ERUPTION';
const SoundCoinsEruptionEndId = 'SOUND_BIG_WIN_COINS_ERUPTION_END';
const AnimCoinEruptionId = 'anim_coins_eruption';

const AnimWinPrizeMajorId = 'anim_win_prize_major';
const AnimWinPrizeGrandId = 'anim_win_prize_grand';
const TextWinPrizeId = 'text_win_prize';

const FrameDuration: tweeny.duration_t = Math.trunc(1000 / 24); // 1frames * 41ms;
const MajorPrizeAlphaAnimationDuration: tweeny.duration_t = FrameDuration * 21;
const MajorPrizeFullAnimationDuration: tweeny.duration_t = FrameDuration * 109;
const GrandPrizeAlphaAnimationDuration: tweeny.duration_t = FrameDuration * 21;
const GrandPrizeFullAnimationDuration: tweeny.duration_t = FrameDuration * 109;

const ElementsAllIds = [
  AnimCoinEruptionId, AnimWinPrizeMajorId, AnimWinPrizeGrandId, TextWinPrizeId];
const ElementsMajorPrizeIds = [
  AnimWinPrizeMajorId, TextWinPrizeId];
const ElementsGrandPrizeIds = [
  AnimWinPrizeGrandId, TextWinPrizeId];

enum EMode {
  None,
  CoinsEruption,
  MajorPrize,
  GrandPrize,
}

export class BigWinView extends BaseView implements IBigWinView {
  protected readonly m_events = new IBigWinViewEvents();

  private m_mode = EMode.None;
  private m_isOpaqueFullScreen = false;

  private m_sentinel = new sentinel();
  private m_actionMajorPrize = new tweeny.tween_action();
  private m_actionGrandPrize = new tweeny.tween_action();

  private m_coinsEruptionPlayback: IAudioPlayback | null = null;

  constructor() {
    super(BigWinViewId);
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

    this.RuntimeAdd(IBigWinView, this);
    this.RuntimeAdd(IBigWinView.Events, this.m_events);

    this.InitElementsList(BigWinViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    if (this.m_coinsEruptionPlayback && this.m_coinsEruptionPlayback.IsPlaying()) {
      this.m_coinsEruptionPlayback.Stop();
      this.m_coinsEruptionPlayback = null;
      this.RuntimeGet(IAudioApi).Play(SoundCoinsEruptionEndId);
    }
    this.RuntimeRemove(IBigWinView);
    this.RuntimeRemove(IBigWinView.Events);

    super.Deinit();
  }

  Process() {
    super.Process();
    if (Unless(this.m_elementsList.IsLoaded())) return;

    switch (this.m_mode) {
      case EMode.CoinsEruption:
        {
          const animCoinEruption = this.m_elementsList.Get(AnimCoinEruptionId, AnimElement);
          if (!animCoinEruption.IsPlaying()) {
            this.m_events.animatingDone.Post();
          }
        }
        break;
      case EMode.MajorPrize: // [[fallthrough]]
      case EMode.GrandPrize: // [[fallthrough]]
      case EMode.None: // [[fallthrough]]
      default: break;
    }
  }

  IsOpaqueFullScreen() {
    return true && this.IsVisible() && this.m_isOpaqueFullScreen &&
      ((this.m_mode === EMode.MajorPrize) || (this.m_mode === EMode.GrandPrize));
  }

  private OnElementsListLoaded() {
    this.m_elementsList.SetHidden(true, ElementsAllIds);
    this.InitAnimations();
    this.AdjustBigWinMode();
  }

  private InitAnimations() {
    this.m_sentinel = make_sentinel();

    // major prize
    {
      const alphaMajorPrize = tweeny.delay(MajorPrizeAlphaAnimationDuration);
      alphaMajorPrize.on_begin.connect(() => {
        this.m_isOpaqueFullScreen = false;
      });
      alphaMajorPrize.on_end.connect(() => {
        this.m_isOpaqueFullScreen = true;
      });
      this.m_actionMajorPrize =
        tweeny.together([tweeny.delay(MajorPrizeFullAnimationDuration), alphaMajorPrize], this.m_sentinel);
      this.m_actionMajorPrize.on_begin.connect(() => {
        const animWinMajor = this.m_elementsList.Get(AnimWinPrizeMajorId, AnimElement);
        animWinMajor.Stop();
        animWinMajor.Rewind();
        animWinMajor.Play();

        const infoScreen = this.RuntimeGet(IInfoView);
        const textWin = this.m_elementsList.Get(TextWinPrizeId, TextElement);
        textWin.SetText(infoScreen.FormatPrize!(36, 2));

        this.m_elementsList.SetHidden(false, ElementsMajorPrizeIds);
      });
      this.m_actionMajorPrize.on_end.connect(() => {
        this.m_isOpaqueFullScreen = false;
        this.m_elementsList.SetHidden(true, ElementsAllIds);

        this.m_events.animatingDone.Post();
      });
    }
    // grand prize
    {
      const alphaGrandPrize = tweeny.delay(GrandPrizeAlphaAnimationDuration);
      alphaGrandPrize.on_begin.connect(() => {
        this.m_isOpaqueFullScreen = false;
      });
      alphaGrandPrize.on_end.connect(() => {
        this.m_isOpaqueFullScreen = true;
      });
      this.m_actionGrandPrize =
        tweeny.together([tweeny.delay(GrandPrizeFullAnimationDuration), alphaGrandPrize], this.m_sentinel);
      this.m_actionGrandPrize.on_begin.connect(() => {
        const animWinGrand = this.m_elementsList.Get(AnimWinPrizeGrandId, AnimElement);
        animWinGrand.Stop();
        animWinGrand.Rewind();
        animWinGrand.Play();

        const infoScreen = this.RuntimeGet(IInfoView);
        const textWin = this.m_elementsList.Get(TextWinPrizeId, TextElement);
        textWin.SetText(infoScreen.FormatPrize!(37, 3));

        this.m_elementsList.SetHidden(false, ElementsGrandPrizeIds);
      });
      this.m_actionGrandPrize.on_end.connect(() => {
        this.m_isOpaqueFullScreen = false;
        this.m_elementsList.SetHidden(true, ElementsAllIds);

        this.m_events.animatingDone.Post();
      });
    }
  }

  private AdjustBigWinMode() {
    if (Unless(this.m_elementsList.IsLoaded())) return;

    switch (this.m_mode) {
      case EMode.None:
        {
          this.m_elementsList.SetHidden(true, ElementsAllIds);
          if (this.m_coinsEruptionPlayback && this.m_coinsEruptionPlayback.IsPlaying()) {
            this.m_coinsEruptionPlayback.Stop();
            this.m_coinsEruptionPlayback = null;
            this.RuntimeGet(IAudioApi).Play(SoundCoinsEruptionEndId);
          }
        }
        break;
      case EMode.CoinsEruption:
        {
          const animCoinEruption = this.m_elementsList.Get(AnimCoinEruptionId, AnimElement);
          animCoinEruption.Stop();
          animCoinEruption.Rewind();
          animCoinEruption.Play();
          animCoinEruption.SetHidden(false);

          this.m_coinsEruptionPlayback = this.RuntimeGet(IAudioApi).Play(SoundCoinsEruptionId);
        }
        break;
      case EMode.MajorPrize:
        {
          const infoScreen = this.RuntimeGet(IInfoView);
          const textWin = this.m_elementsList.Get(TextWinPrizeId, TextElement);
          textWin.SetText(infoScreen.FormatPrize!(36, 2));
          tweeny.start(this.m_actionMajorPrize, 'BigWinView/MajorPrize');
        }
        break;
      case EMode.GrandPrize:
        {
          const infoScreen = this.RuntimeGet(IInfoView);
          const textWin = this.m_elementsList.Get(TextWinPrizeId, TextElement);
          textWin.SetText(infoScreen.FormatPrize!(37, 3));
          tweeny.start(this.m_actionGrandPrize, 'BigWinView/GrandPrize');
        }
        break;
    }
  }

  // IBigWinView
  ApplyPhase(_todo_useSpecificType: string) {}

  Clear() {
    this.m_mode = EMode.None;
    this.AdjustBigWinMode();
  }

  ShowAnimation(roundTag: ERoundTags) {
    switch (roundTag) {
      case ERoundTags.BigWin:
        this.m_mode = EMode.CoinsEruption;
        this.AdjustBigWinMode();
        break;
      case ERoundTags.MajorSymbolPrize:
        this.m_mode = EMode.MajorPrize;
        this.AdjustBigWinMode();
        break;
      case ERoundTags.GrandSymbolPrize:
        this.m_mode = EMode.GrandPrize;
        this.AdjustBigWinMode();
        break;
      default: break;
    }

    this.m_events.animating.Post();
  }
}
