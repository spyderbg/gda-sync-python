// Egt::Game::AlphaFamily::BigWinView (JokerReelsCoins10View/Views/BigWinView.h/.cpp): the big win's coins eruption
// animation, with its sound.

import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { AnimElement } from '@game/engine/GameVideoCtrl/ViewElements/AnimElement';
import { ERoundTags } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IBigWinView, IBigWinViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const BigWinViewId = 'BigWinView';

const SoundCoinsEruptionId = 'SOUND_BIG_WIN_COINS_ERUPTION';
const SoundCoinsEruptionEndId = 'SOUND_BIG_WIN_COINS_ERUPTION_END';
const AnimCoinEruptionId = 'anim_coins_eruption';

const ElementsAllIds = [AnimCoinEruptionId];

enum EMode {
  None,
  CoinsEruption,
}

export class BigWinView extends BaseView implements IBigWinView {
  protected readonly m_events = new IBigWinViewEvents();

  private m_mode = EMode.None;
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
      case EMode.None: // [[fallthrough]]
      default: break;
    }
  }

  private OnElementsListLoaded() {
    this.m_elementsList.SetHidden(true, ElementsAllIds);
    this.InitAnimations();
    this.AdjustBigWinMode();
  }

  private InitAnimations() {}

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
      default: break;
    }

    this.m_events.animating.Post();
  }
}
