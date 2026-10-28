// Egt::Game::AlphaFamily::NordicRushView (NordicRushView.h/.cpp): the view module, which
// creates the game's views, processes and draws them in order, from the last one that covers the screen, and gives them the
// touches, the topmost first.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { IFileWatch } from '@game/engine/Game/RuntimeExport/IFileWatch';
import { IVideo, type TouchEventData } from '@game/engine/GameVideoCtrl/RuntimeExport/IVideo';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import type { BaseView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/BaseView';
import { BetDownSwButtonView } from './SwButtons/BetDownSwButtonView';
import { BetUpSwButtonView } from './SwButtons/BetUpSwButtonView';
import { ExitGameSwButtonView } from './SwButtons/ExitGameSwButtonView';
import { InfoSwButtonView } from './SwButtons/InfoSwButtonView';
import { LanguageSwButtonView } from './SwButtons/LanguageSwButtonView';
import { LineDownSwButtonView } from './SwButtons/LineDownSwButtonView';
import { LineUpSwButtonView } from './SwButtons/LineUpSwButtonView';
import { ResponsibleSwButtonView } from './SwButtons/ResponsibleSwButtonView';
import { SoundVolumeSwButtonView } from './SwButtons/SoundVolumeSwButtonView';
import { StopSingleReelSwButtonView } from './SwButtons/StopSingleReelSwButtonView';
import { TakeCoinsSwButtonView } from './SwButtons/TakeCoinsSwButtonView';
import { WheelCancelSwButtonView } from './SwButtons/WheelCancelSwButtonView';
import { WheelStartSwButtonView } from './SwButtons/WheelStartSwButtonView';
import { AutoPlayView } from './Views/AutoPlayView';
import { BetBarView } from './Views/BetBarView';
import { BetMenuView } from './Views/BetMenuView';
import { BigWinView } from './Views/BigWinView';
import { CoinsBarView } from './Views/CoinsBarView';
import { CoinsRoundOverlayView } from './Views/CoinsRoundOverlayView';
import { CreditBarView } from './Views/CreditBarView';
import { CreditsWinBarView } from './Views/CreditsWinBarView';
import { FreeRoundOverlayView } from './Views/FreeRoundOverlayView';
import { FreeRoundRetriggerView } from './Views/FreeRoundRetriggerView';
import { FreeSpinBarView } from './Views/FreeSpinBarView';
import { GameBackgroundView } from './Views/GameBackgroundView';
import { HoldAndSpinBarView } from './Views/HoldAndSpinBarView';
import { HoldAndSpinRoundOverlayView } from './Views/HoldAndSpinRoundOverlayView';
import { KnobsView } from './Views/KnobsView';
import { LanguageMenuView } from './Views/LanguageMenuView';
import { LinesView } from './Views/LinesView';
import { ReelsOverlayView } from './Views/ReelsOverlayView';
import { ReelsView } from './Views/ReelsView';
import { SoundMenuView } from './Views/SoundMenuView';
import { StatusLineView } from './Views/StatusLineView';
import { WheelRoundOverlayView } from './Views/WheelRoundOverlayView';
import { WheelRoundView } from './Views/WheelRoundView';
import { WinFiguresView } from './Views/WinFiguresView';

import type { ViewGroup } from '@game/app/GameModules';

export type { ViewGroup };

export class NordicRushView extends BaseModule {
  private m_views: BaseView[] = [];
  private m_viewGroups: ViewGroup[] = [];

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.CreateViews();
    for (const view of this.m_views) view.Init(this.GetRuntime());
    return true;
  }

  PostInit() {
    this.RuntimeTryGet(IVideo)?.RegisterDrawMain(event => this.HandleOsEvent(event), drawList => this.Draw(drawList));
    this.RuntimeTryGet(IFileWatch.Events)?.fileChanged.RegisterInstant(this, filepath => this.OnFileChanged(filepath));
    this.RuntimeTryGet(ILocalization.Events)?.languageChanged.RegisterInstant(this, language => {
      this.RuntimeGet(IResources).SetLanguage(language);
      for (const view of this.m_views) view.OnLanguageChanged(language);
    });
    return true;
  }

  PreDeinit() {
    this.RuntimeTryGet(IVideo)?.UnregisterDrawMain();
    this.RuntimeTryGet(IFileWatch.Events)?.fileChanged.Unregister(this);
    this.RuntimeTryGet(ILocalization.Events)?.languageChanged.Unregister(this);
  }

  Deinit() {
    for (const view of [...this.m_views].reverse()) view.Deinit();
    this.m_views = [];
    this.m_viewGroups = [];
    super.Deinit();
  }

  Process() {
    for (const view of this.m_views) view.Process();
  }

  /** The views, for the page's debug panel. */
  GetViews(): readonly BaseView[] {
    return this.m_views;
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

  private HandleOsEvent(event: TouchEventData) {
    const views = [...this.m_views].reverse();
    if (event.type === 'down') return views.some(view => view.HandleTouchDown(Math.trunc(event.x), Math.trunc(event.y)));
    let captured = false;
    for (const view of views) captured = view.HandleTouchUp(Math.trunc(event.x), Math.trunc(event.y)) || captured;
    return captured;
  }

  /** The views of CreateViews() in groups, as its C++ comments and blank lines group them: what the C++ export writes. */
  GetViewGroups(): readonly ViewGroup[] {
    return this.m_viewGroups;
  }

  private AddViews(comment: string, ...views: BaseView[]) {
    this.m_views.push(...views);
    this.m_viewGroups.push({ comment, views: views.map(view => view.GetName()) });
  }

  private CreateViews() {
    this.AddViews('background', new GameBackgroundView());
    this.AddViews('rounds', new ReelsView(), new ReelsOverlayView(), new WinFiguresView());
    this.AddViews('wheel', new WheelRoundView(), new WheelCancelSwButtonView(), new WheelStartSwButtonView());
    this.AddViews(
      'bars',
      new CreditBarView(),
      new CoinsBarView(),
      new CreditsWinBarView(),
      new BetBarView(),
      new HoldAndSpinBarView(),
      new LinesView(),
      new StatusLineView(),
      new AutoPlayView(),
      new KnobsView(),
    );
    this.AddViews('menus', new BetMenuView(), new LanguageMenuView(), new SoundMenuView());
    this.AddViews(
      'sw buttons',
      new BetUpSwButtonView(),
      new BetDownSwButtonView(),
      new LineUpSwButtonView(),
      new LineDownSwButtonView(),
      new StopSingleReelSwButtonView(),
      new ResponsibleSwButtonView(),
      new LanguageSwButtonView(),
      new SoundVolumeSwButtonView(),
      new InfoSwButtonView(),
      new TakeCoinsSwButtonView(),
      new ExitGameSwButtonView(),
    );
    this.AddViews('', new FreeSpinBarView());
    this.AddViews(
      'overlay',
      new HoldAndSpinRoundOverlayView(),
      new CoinsRoundOverlayView(),
      new FreeRoundRetriggerView(),
      new FreeRoundOverlayView(),
      new WheelRoundOverlayView(),
      new BigWinView(),
    );
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
