// Egt::Game::AlphaFamily::BurningCrownTetraSpins10TopperView (BurningCrownTetraSpins10TopperView.h/.cpp): the module of
// the topper screen, which creates its views and draws them on it.

import type { Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import type { DrawList } from '../../../../engine/GameVideoCtrl/DrawList';
import { IVideo } from '../../../../engine/GameVideoCtrl/RuntimeExport/IVideo';
import { BaseModule, type ModuleConfig } from '../../../../engine/ModuleManager/BaseModule';
import { VideoManager } from '../../../../engine/VideoManager/VideoManager';
import type { BaseView } from '../../../libs/AlphaFamilyVideoCtrl/BaseView';
import { TopperView } from './TopperView';

export class BurningCrownTetraSpins10TopperView extends BaseModule {
  private m_views: BaseView[] = [];
  private m_sized = false;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.m_views.push(new TopperView());
    for (const view of this.m_views) view.Init(this.GetRuntime());
    return true;
  }

  PostInit() {
    this.RuntimeTryGet(IVideo)?.RegisterDrawTopper(null, drawList => this.Draw(drawList));
    return true;
  }

  PreDeinit() {
    this.RuntimeTryGet(IVideo)?.UnregisterDrawTopper();
  }

  Deinit() {
    for (const view of [...this.m_views].reverse()) view.Deinit();
    this.m_views = [];
    super.Deinit();
  }

  Process() {
    for (const view of this.m_views) view.Process();
    // The browser's topper screen takes the size of the topper's picture (in C++ the integration's viewport has it).
    if (!this.m_sized) {
      const size = this.m_views.find((view): view is TopperView => view instanceof TopperView)?.GetContentSize();
      const video = this.RuntimeTryGet(IVideo);
      if (size && size.w > 0 && video instanceof VideoManager) {
        video.SetTopperResolution(size.w, size.h);
        this.m_sized = true;
      }
    }
  }

  private Draw(drawList: DrawList) {
    for (const view of this.m_views) view.Draw(drawList);
  }
}
