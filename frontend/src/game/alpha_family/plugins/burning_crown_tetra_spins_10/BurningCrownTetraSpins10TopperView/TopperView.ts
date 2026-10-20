// Egt::Game::AlphaFamily::TopperView (BurningCrownTetraSpins10TopperView/TopperView.h/.cpp): the topper screen's
// picture (TopperView.json).

import type { Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import type { DrawList } from '../../../../engine/GameVideoCtrl/DrawList';
import { type ITopperView, ITopperView as ITopperViewToken } from '../../../libs/AlphaFamily/Views/IOverlayViews.bridge';
import { BaseView } from '../../../libs/AlphaFamilyVideoCtrl/BaseView';

const TopperViewId = 'TopperView';

export class TopperView extends BaseView implements ITopperView {
  constructor() {
    super(TopperViewId);
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.RuntimeAdd(ITopperViewToken, this);
    this.InitElementsList(TopperViewId, () => this.OnElementsListLoaded());
    return true;
  }

  Deinit() {
    this.RuntimeRemove(ITopperViewToken);
  }

  Process() {
    super.Process();
    this.m_elementsList.Update();
  }

  Draw(drawList: DrawList) {
    if (!this.IsVisible()) return;
    this.m_elementsList.Draw(drawList);
  }

  RefreshAnimations() {}

  /** The size its elements cover, from the view's origin: what the topper screen shows (in C++ the integration's
   * viewport has it).
   * @browserOnly */
  GetContentSize() {
    let w = 0;
    let h = 0;
    for (const element of this.m_elementsList.GetElements()) {
      if (element.GetHidden()) continue;
      const bounds = element.GetBounds();
      w = Math.max(w, bounds.x + bounds.w);
      h = Math.max(h, bounds.y + bounds.h);
    }
    return { w, h };
  }

  private OnElementsListLoaded() {
    this.SetVisible(true);
  }
}
