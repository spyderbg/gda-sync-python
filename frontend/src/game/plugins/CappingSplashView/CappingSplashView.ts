// Egt::Game::CappingSplashView (plugins/src/Egt/CappingSplashView): a module of every alpha family game
// (configs/alpha_family/modules/AlphaGameModules.json) that shows the maximum award splash on its render layer, over the
// game, until the state machine hides it or its idle time passes. Its view is the common feature's
// (resources/common/features/new_capping), which the game's descriptors include.

import { ILocalization } from '../../engine/Game/RuntimeImport/ILocalization';
import { CountdownTimer } from '../../engine/Game/Utils/CountdownTimer';
import type { Runtime } from '../../engine/GameCore/RuntimeAccess';
import { IVideoManager } from '../../engine/GameVideoCtrl/RuntimeExport/IVideoManager';
import { ElementsList } from '../../engine/GameVideoCtrl/ViewElements/ElementsList';
import { BaseModule, type ModuleConfig } from '../../engine/ModuleManager/BaseModule';
import { type ICappingSplashView, ICappingSplashView as ICappingSplashViewToken, ICappingSplashViewEvents } from '../../alpha_family/libs/AlphaFamily/Views/ICappingSplashView.bridge';
import { CappingSplashViewConfig } from './CappingSplashView.data';

const CappingSplashViewId = 'CappingSplashView';
const ImageMaximumAwardFeatureEndId = 'image_maximum_award_feature_end';

export class CappingSplashView extends BaseModule implements ICappingSplashView {
  protected m_config = CappingSplashViewConfig();
  protected readonly m_events = new ICappingSplashViewEvents();
  protected m_enabled = true;
  protected m_visible = false;
  protected m_focused = false;
  protected m_showAllFeaturesEnd = false;
  protected m_skin = '';
  private readonly m_elementsList = new ElementsList();
  private readonly m_IdleTimer = new CountdownTimer();

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.m_config = CappingSplashViewConfig(config as Partial<CappingSplashViewConfig>);
    this.RuntimeAdd(ICappingSplashViewToken, this);
    this.RuntimeAdd(ICappingSplashViewToken.Events, this.m_events);
    this.SetEnabled(false);
    this.SetVisible(false);
    // initialize a view elements list
    this.m_elementsList.Init(this.GetRuntime(), CappingSplashViewId);
    this.m_elementsList.SetOnElementsListLoadedCallback(() => this.AdjustVisibility());
    this.m_elementsList.LoadFromResource();
    return true;
  }

  PostInit() {
    // register render layer
    this.RuntimeTryGet(IVideoManager)?.RegisterRenderLayerMain(
      this.m_config.layerId,
      event => {
        if (!this.m_visible) return false;
        if (event.type === 'down') this.m_elementsList.HandleTouchDown(event);
        else this.m_elementsList.HandleTouchUp(event);
        return true;
      },
      drawList => {
        if (!this.m_visible) return;
        this.m_elementsList.Draw(drawList);
      },
      null,
    );
    this.RuntimeTryGet(ILocalization.Events)?.languageChanged.RegisterInstant(this, language => this.m_elementsList.OnLanguageChanged(language));
    return true;
  }

  PreDeinit() {
    this.RuntimeTryGet(IVideoManager)?.UnregisterRenderLayerMain(this.m_config.layerId);
    this.RuntimeTryGet(ILocalization.Events)?.languageChanged.Unregister(this);
  }

  Deinit() {
    this.m_elementsList.Deinit();
    this.RuntimeRemove(ICappingSplashViewToken);
    this.RuntimeRemove(ICappingSplashViewToken.Events);
    super.Deinit();
  }

  Process() {
    if (this.m_visible) {
      this.m_elementsList.Update(performance.now());
      this.CheckIdleTimer();
    }
  }

  SetEnabled(enabled: boolean) {
    this.m_enabled = enabled;
  }

  SetVisible(visible: boolean) {
    this.m_visible = visible;
  }

  SetFocused(focused: boolean) {
    this.m_focused = focused;
  }

  SetSkin(skin: string) {
    this.m_skin = skin;
  }

  ShowCappingSplashView(showAllFeaturesEnd: boolean) {
    this.m_showAllFeaturesEnd = showAllFeaturesEnd;
    this.AdjustVisibility();
    this.SetVisible(true);
    this.ResetIdleTimer();
  }

  private AdjustVisibility() {
    this.m_elementsList.TryGet(ImageMaximumAwardFeatureEndId)?.SetHidden(!this.m_showAllFeaturesEnd);
  }

  HideCappingSplashView() {
    this.SetVisible(false);
  }

  /** Whether the splash shows, for the page. */
  IsVisible() {
    return this.m_visible;
  }

  protected ResetIdleTimer() {
    this.m_IdleTimer.Stop();
    this.m_IdleTimer.SetDuration(this.m_config.idleTimeMs);
    this.m_IdleTimer.Start();
  }

  protected IdleTimerExpired() {
    this.m_IdleTimer.Stop();
    this.HideCappingSplashView();
    this.m_events.splashIdleDismissed.Post();
  }

  protected CheckIdleTimer() {
    if (!this.m_IdleTimer.IsRunning() || !this.m_IdleTimer.IsExpired()) return;
    this.IdleTimerExpired();
  }
}
