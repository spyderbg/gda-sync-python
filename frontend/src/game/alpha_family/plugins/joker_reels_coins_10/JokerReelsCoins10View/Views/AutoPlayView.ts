// Egt::Game::AlphaFamily::AutoPlayView (JokerReelsCoins10View/Views/AutoPlayView.h/.cpp): whether autoplay is
// on; its intro and outro sounds play when it changes.

import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IAutoPlayView } from '@game/alpha_family/libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';

const AutoPlayViewId = 'AutoPlayView';
const SoundAutoPlayOnId = 'SOUND_AUTOPLAY_INTRO';
const SoundAutoPlayOffId = 'SOUND_AUTOPLAY_OUTRO';

export class AutoPlayView extends BaseView implements IAutoPlayView {
  private m_isAutoplay = false;

  constructor() {
    super(AutoPlayViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);

    this.RuntimeAdd(IAutoPlayView, this);

    this.InitElementsList(AutoPlayViewId, () => {
      this.OnElementsListLoaded();
    });

    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    this.RuntimeRemove(IAutoPlayView);
    super.Deinit();
  }

  SetAutoPlay(autoPlayOn: boolean) {
    if (this.m_isAutoplay === autoPlayOn) return;
    this.m_isAutoplay = autoPlayOn;

    if (Unless(this.m_elementsList.IsLoaded())) return;
    const soundToPlay = autoPlayOn ? SoundAutoPlayOnId : SoundAutoPlayOffId;
    this.RuntimeGet(IAudioApi).Play(soundToPlay);
  }

  IsAutoPlayOn() {
    return this.m_isAutoplay;
  }

  private OnElementsListLoaded() {}
}
