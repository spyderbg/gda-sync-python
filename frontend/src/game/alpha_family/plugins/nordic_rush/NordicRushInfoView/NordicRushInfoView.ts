// Egt::Game::AlphaFamily::NordicRushInfoView (NordicRushInfoView.h/.cpp): the module of the
// info screen, which creates its views (the help pages, InfoView; the hold and spin round's prizes; the big win), processes
// them and draws them on the info screen, from the last one that covers the screen.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { IFileWatch } from '@game/engine/Game/RuntimeExport/IFileWatch';
import { IVideo } from '@game/engine/GameVideoCtrl/RuntimeExport/IVideo';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import type { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BigWinInfoView } from './BigWinInfoView';
import { HoldAndSpinRoundInfoView } from './HoldAndSpinRoundInfoView';
import { InfoView } from './InfoView';

export class NordicRushInfoView extends BaseModule {
  private m_views: BaseView[] = [];

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.CreateViews();
    for (const view of this.m_views) view.Init(this.GetRuntime());
    return true;
  }

  PostInit() {
    this.RuntimeTryGet(IVideo)?.RegisterDrawInfo(null, drawList => this.Draw(drawList));
    this.RuntimeTryGet(IFileWatch.Events)?.fileChanged.RegisterInstant(this, filepath => this.OnFileChanged(filepath));
    return true;
  }

  PreDeinit() {
    this.RuntimeTryGet(IVideo)?.UnregisterDrawInfo();
    this.RuntimeTryGet(IFileWatch.Events)?.fileChanged.Unregister(this);
  }

  Deinit() {
    for (const view of [...this.m_views].reverse()) view.Deinit();
    this.m_views = [];
    super.Deinit();
  }

  Process() {
    for (const view of this.m_views) view.Process();
  }

  private OnFileChanged(filepath: string) {
    for (const view of this.m_views) view.HandleFileChanged(filepath);
  }

  private Draw(drawList: DrawList) {
    const minLayerIndexToDraw = this.FindMaxOpaqueIndex();
    for (let index = Math.max(minLayerIndexToDraw, 0); index < this.m_views.length; ++index) {
      const view = this.m_views[index];
      view.Draw(drawList);
    }
  }

  /** The help pages, for the page around the game. */
  GetInfoView() {
    return this.m_views.find((view): view is InfoView => view instanceof InfoView) ?? null;
  }

  private CreateViews() {
    this.m_views.push(new InfoView());
    this.m_views.push(new HoldAndSpinRoundInfoView());
    this.m_views.push(new BigWinInfoView());
  }

  private FindMaxOpaqueIndex() {
    for (let maxIndex = this.m_views.length - 1; maxIndex >= 0; --maxIndex) {
      if (this.m_views[maxIndex].IsOpaqueFullScreen()) {
        return maxIndex;
      }
    }
    return -1;
  }
}
