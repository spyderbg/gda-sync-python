// Egt::Game::AlphaFamily::BurningCrownTetraSpins10InfoView (BurningCrownTetraSpins10InfoView.h/.cpp): the module of the
// info screen, which creates its views (the help pages, InfoView), processes them and draws them on the info screen.

import type { Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import type { DrawList } from '../../../../engine/GameVideoCtrl/DrawList';
import { IVideo } from '../../../../engine/GameVideoCtrl/RuntimeExport/IVideo';
import { BaseModule, type ModuleConfig } from '../../../../engine/ModuleManager/BaseModule';
import type { BaseView } from '../../../libs/AlphaFamilyVideoCtrl/BaseView';
import { InfoView } from './InfoView';

export class BurningCrownTetraSpins10InfoView extends BaseModule {
  private m_views: BaseView[] = [];

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.CreateViews();
    for (const view of this.m_views) view.Init(this.GetRuntime());
    return true;
  }

  PostInit() {
    this.RuntimeTryGet(IVideo)?.RegisterDrawInfo(null, drawList => this.Draw(drawList));
    return true;
  }

  PreDeinit() {
    this.RuntimeTryGet(IVideo)?.UnregisterDrawInfo();
  }

  Deinit() {
    for (const view of [...this.m_views].reverse()) view.Deinit();
    this.m_views = [];
    super.Deinit();
  }

  Process() {
    for (const view of this.m_views) view.Process();
  }

  private Draw(drawList: DrawList) {
    for (const view of this.m_views) view.Draw(drawList);
  }

  /** The help pages, for the page around the game. */
  GetInfoView() {
    return this.m_views.find((view): view is InfoView => view instanceof InfoView) ?? null;
  }

  private CreateViews() {
    this.m_views.push(new InfoView());
  }
}
