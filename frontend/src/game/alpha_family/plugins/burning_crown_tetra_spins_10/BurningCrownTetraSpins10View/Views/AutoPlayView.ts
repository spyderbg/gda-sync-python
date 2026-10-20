// Egt::Game::AlphaFamily::AutoPlayView (BurningCrownTetraSpins10View/Views/AutoPlayView.h/.cpp): whether autoplay is on.

import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IAutoPlayView } from '../../../../libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '../../../../libs/AlphaFamilyVideoCtrl/BaseView';

const AutoPlayViewId = 'AutoPlayView';

export class AutoPlayView extends BaseView implements IAutoPlayView {
  private m_autoPlayOn = false;

  constructor() {
    super(AutoPlayViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(IAutoPlayView, this);
    this.InitElementsList(AutoPlayViewId);
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    this.RuntimeRemove(IAutoPlayView);
    super.Deinit();
  }

  SetAutoPlay(autoPlayOn: boolean) {
    this.m_autoPlayOn = autoPlayOn;
  }

  IsAutoPlayOn() {
    return this.m_autoPlayOn;
  }
}
