// Egt::Game::AlphaFamily::BigWinView (BurningCrownTetraSpins10View/Views/BigWinView.h/.cpp): the big, super, epic and
// mega win animations: movies (RssMoviesData.json) of coins under the win's title, with the coins eruption sound.

import { IAudioApi, type IAudioPlayback } from '../../../../../engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { AnimElement } from '../../../../../engine/GameVideoCtrl/ViewElements/AnimElement';
import { ERoundTags } from '../../../../libs/AlphaFamily/Math/Common/Common.data';
import { IBigWinView, IBigWinViewEvents } from '../../../../libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';

const BigWinViewId = 'BigWinView';
const SoundCoinsEruptionId = 'SOUND_BIG_WIN_COINS_ERUPTION';
const SoundCoinsEruptionEndId = 'SOUND_BIG_WIN_COINS_ERUPTION_END';
const ElementsAllIds = ['anim_big_win', 'anim_super_win', 'anim_epic_win', 'anim_mega_win'];

export class BigWinView extends BaseView implements IBigWinView {
  private readonly m_events = new IBigWinViewEvents();
  private m_animationId = '';
  private m_coinsEruptionPlayback: IAudioPlayback | null = null;

  constructor() {
    super(BigWinViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IBigWinView, this);
    this.RuntimeAdd(IBigWinView.Events, this.m_events);
    this.InitElementsList(BigWinViewId, () => this.AdjustBigWinMode());
    return true;
  }

  Deinit() {
    this.Clear();
    this.DeinitElementsList();
    this.RuntimeRemove(IBigWinView);
    this.RuntimeRemove(IBigWinView.Events);
    super.Deinit();
  }

  private AdjustBigWinMode() {
    if (!this.m_elementsList.IsLoaded()) return;
    this.m_elementsList.SetHidden(true, ElementsAllIds);
    if (!this.m_animationId) {
      if (this.m_coinsEruptionPlayback?.IsPlaying()) {
        this.m_coinsEruptionPlayback.Stop();
        this.m_coinsEruptionPlayback = null;
        this.RuntimeGet(IAudioApi).Play(SoundCoinsEruptionEndId);
      }
      return;
    }
    const animation = this.m_elementsList.TryGet(this.m_animationId, AnimElement);
    animation?.Stop();
    animation?.Rewind();
    animation?.Play();
    animation?.SetHidden(false);
    if (!this.m_coinsEruptionPlayback?.IsPlaying()) this.m_coinsEruptionPlayback = this.RuntimeGet(IAudioApi).Play(SoundCoinsEruptionId);
  }

  ApplyPhase(_todo_useSpecificType: string) {}

  Clear() {
    this.m_animationId = '';
    this.AdjustBigWinMode();
  }

  ShowAnimation(roundTag: ERoundTags) {
    const ids: Partial<Record<ERoundTags, string>> = {
      [ERoundTags.BigWin]: 'anim_big_win', [ERoundTags.SuperWin]: 'anim_super_win', [ERoundTags.EpicWin]: 'anim_epic_win', [ERoundTags.MegaWin]: 'anim_mega_win',
    };
    const id = ids[roundTag];
    if (!id) return;
    this.m_animationId = id;
    this.AdjustBigWinMode();
    this.m_events.animating.Post();
  }
}
