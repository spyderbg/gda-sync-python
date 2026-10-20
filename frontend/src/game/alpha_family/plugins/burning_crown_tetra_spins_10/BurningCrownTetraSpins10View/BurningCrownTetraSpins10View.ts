// Egt::Game::AlphaFamily::BurningCrownTetraSpins10View (BurningCrownTetraSpins10View.h/.cpp): the view module, which
// creates the game's views, processes and draws them in order, and gives them the touches, the topmost first.

import type { Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import { ILocalization } from '../../../../engine/Game/RuntimeImport/ILocalization';
import { IResources } from '../../../../engine/Game/RuntimeExport/IResources';
import type { DrawList } from '../../../../engine/GameVideoCtrl/DrawList';
import { IFileWatch } from '../../../../engine/Game/RuntimeExport/IFileWatch';
import { IVideo, type TouchEventData } from '../../../../engine/GameVideoCtrl/RuntimeExport/IVideo';
import { BaseModule, type ModuleConfig } from '../../../../engine/ModuleManager/BaseModule';
import type { BaseView } from '../../../libs/AlphaFamilyVideoCtrl/BaseView';
import { BetDownSwButtonView } from './SwButtons/BetDownSwButtonView';
import { BetUpSwButtonView } from './SwButtons/BetUpSwButtonView';
import { ExitGameSwButtonView } from './SwButtons/ExitGameSwButtonView';
import { ExitTetraSwButtonView } from './SwButtons/ExitTetraSwButtonView';
import { InfoSwButtonView } from './SwButtons/InfoSwButtonView';
import { LanguageSwButtonView } from './SwButtons/LanguageSwButtonView';
import { LineDownSwButtonView } from './SwButtons/LineDownSwButtonView';
import { LineUpSwButtonView } from './SwButtons/LineUpSwButtonView';
import { ResponsibleSwButtonView } from './SwButtons/ResponsibleSwButtonView';
import { SoundVolumeSwButtonView } from './SwButtons/SoundVolumeSwButtonView';
import { StopSingleReelSwButtonView } from './SwButtons/StopSingleReelSwButtonView';
import { AutoPlayView } from './Views/AutoPlayView';
import { BetBarView } from './Views/BetBarView';
import { BetMenuView } from './Views/BetMenuView';
import { BigWinView } from './Views/BigWinView';
import { CreditBarView } from './Views/CreditBarView';
import { CreditsWinBarView } from './Views/CreditsWinBarView';
import { GameBackgroundView } from './Views/GameBackgroundView';
import { KnobsView } from './Views/KnobsView';
import { LanguageMenuView } from './Views/LanguageMenuView';
import { LinesView } from './Views/LinesView';
import { ReelsView } from './Views/ReelsView';
import { SoundMenuView } from './Views/SoundMenuView';
import { StatusLineView } from './Views/StatusLineView';
import { TetraRoundOverlayView } from './Views/TetraRoundOverlayView';
import { TetraRoundView } from './Views/TetraRoundView';
import { TetraSpinBarView } from './Views/TetraSpinBarView';
import { WinFiguresView } from './Views/WinFiguresView';

/** Views that CreateViews() adds together, under a comment (none: after a blank line). */
export interface ViewGroup {
  comment: string;
  views: string[];
}

export class BurningCrownTetraSpins10View extends BaseModule {
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
    for (const view of this.m_views) view.Draw(drawList);
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
    this.AddViews('rounds', new ReelsView(), new WinFiguresView());
    this.AddViews('', new TetraRoundView());
    this.AddViews(
      'bars',
      new CreditBarView(),
      new CreditsWinBarView(),
      new BetBarView(),
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
      new ExitGameSwButtonView(),
      new ExitTetraSwButtonView(),
    );
    this.AddViews('tetra', new TetraSpinBarView(), new TetraRoundOverlayView());
    this.AddViews('', new BigWinView());
  }
}
