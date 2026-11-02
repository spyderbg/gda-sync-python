// Egt::Game::AlphaFamily::AlphaFamilyAutomationView (AlphaFamilyAutomationView/AlphaFamilyAutomationView.h/.cpp): the
// automation's view module, which the AutomationManager loads while it plays games and unloads after. While started,
// its stub views take the game's views' places in the runtime: the animations finish at once (skipAnims), and the
// player's buttons press themselves (autoInput: START and the wheel's start, and the coins' take with the wheel
// strategy). The C++'s StubTaxationView, StubFreeRoundIntroView and StubFreeRoundOutroView stub interfaces the browser
// game has not ported (no game of it has them), which the C++ skips when the runtime has none.

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import { AlphaFamilyAutomationViewConfig } from './AlphaFamilyAutomationView.data';
import type { IStubView } from './Components/IStubView';
import { StubAutoPlayView } from './Views/StubAutoPlayView';
import { StubBetBarView } from './Views/StubBetBarView';
import { StubBetDownSwButtonView } from './Views/StubBetDownSwButtonView';
import { StubBetMenuView } from './Views/StubBetMenuView';
import { StubBetUpSwButtonView } from './Views/StubBetUpSwButtonView';
import { StubBigWinView } from './Views/StubBigWinView';
import { StubCappingSplashView } from './Views/StubCappingSplashView';
import { StubCoinsBarView } from './Views/StubCoinsBarView';
import { StubCoinsFreeSpinBarView } from './Views/StubCoinsFreeSpinBarView';
import { StubCoinsRoundOverlayView } from './Views/StubCoinsRoundOverlayView';
import { StubCoinsWinBarView } from './Views/StubCoinsWinBarView';
import { StubCreditBarView } from './Views/StubCreditBarView';
import { StubCreditsWinBarView } from './Views/StubCreditsWinBarView';
import { StubExitGameSwButtonView } from './Views/StubExitGameSwButtonView';
import { StubExtraFreeSpinBarView } from './Views/StubExtraFreeSpinBarView';
import { StubExtraRoundOverlayView } from './Views/StubExtraRoundOverlayView';
import { StubExtraSpinBarView } from './Views/StubExtraSpinBarView';
import { StubFreeRoundOverlayView } from './Views/StubFreeRoundOverlayView';
import { StubFreeRoundRetriggerView } from './Views/StubFreeRoundRetriggerView';
import { StubFreeSpinBarView } from './Views/StubFreeSpinBarView';
import { StubGambleBlackSwButtonView } from './Views/StubGambleBlackSwButtonView';
import { StubGambleRedSwButtonView } from './Views/StubGambleRedSwButtonView';
import { StubHoldAndSpinBarView } from './Views/StubHoldAndSpinBarView';
import { StubHoldAndSpinRoundInfoView } from './Views/StubHoldAndSpinRoundInfoView';
import { StubHoldAndSpinRoundOverlayView } from './Views/StubHoldAndSpinRoundOverlayView';
import { StubInfoSwButtonView } from './Views/StubInfoSwButtonView';
import { StubInfoView } from './Views/StubInfoView';
import { StubKnobsView } from './Views/StubKnobsView';
import { StubLanguageSwButtonView } from './Views/StubLanguageSwButtonView';
import { StubLineDownSwButtonView } from './Views/StubLineDownSwButtonView';
import { StubLineUpSwButtonView } from './Views/StubLineUpSwButtonView';
import { StubLinesView } from './Views/StubLinesView';
import { StubReelsOverlayView } from './Views/StubReelsOverlayView';
import { StubReelsView } from './Views/StubReelsView';
import { StubResponsibleSwButtonView } from './Views/StubResponsibleSwButtonView';
import { StubSoundVolumeSwButtonView } from './Views/StubSoundVolumeSwButtonView';
import { StubStartGameHwButton } from './Views/StubStartGameHwButton';
import { StubStatusLineView } from './Views/StubStatusLineView';
import { StubStopSingleReelSwButtonView } from './Views/StubStopSingleReelSwButtonView';
import { StubTakeCoinsSwButtonView } from './Views/StubTakeCoinsSwButtonView';
import { StubTetraRoundOverlayView } from './Views/StubTetraRoundOverlayView';
import { StubTetraRoundView } from './Views/StubTetraRoundView';
import { StubWheelRoundOverlayView } from './Views/StubWheelRoundOverlayView';
import { StubWheelRoundView } from './Views/StubWheelRoundView';
import { StubWheelStartSwButtonView } from './Views/StubWheelStartSwButtonView';
import { StubWinFiguresView } from './Views/StubWinFiguresView';
import { WheelStrategy_StubStartGameHwButton } from './Views/WheelStrategy_StubStartGameHwButton';
import { WheelStrategy_StubTakeCoinsSwButtonView } from './Views/WheelStrategy_StubTakeCoinsSwButtonView';

export class AlphaFamilyAutomationView extends BaseModule {
  private readonly m_config = new AlphaFamilyAutomationViewConfig();
  private m_views: IStubView[] = [];

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);

    this.m_config.DeserializeFrom(config);

    if (this.m_config.skipAnims) {
      // C++'s StubTaxationView first: not ported (see above)
      this.m_views.push(new StubReelsView());
      this.m_views.push(new StubReelsOverlayView());
      this.m_views.push(new StubWinFiguresView());
      this.m_views.push(new StubLinesView());
      this.m_views.push(new StubFreeRoundOverlayView());
      this.m_views.push(new StubFreeRoundRetriggerView());
      this.m_views.push(new StubExtraRoundOverlayView());
      this.m_views.push(new StubTetraRoundOverlayView());
      this.m_views.push(new StubTetraRoundView());
      this.m_views.push(new StubCoinsRoundOverlayView());
      this.m_views.push(new StubHoldAndSpinRoundInfoView());
      this.m_views.push(new StubHoldAndSpinRoundOverlayView());
      this.m_views.push(new StubCreditBarView());
      this.m_views.push(new StubCreditsWinBarView());
      this.m_views.push(new StubBigWinView());
      this.m_views.push(new StubCappingSplashView());
      this.m_views.push(new StubCoinsBarView());
      this.m_views.push(new StubInfoView());
      this.m_views.push(new StubBetBarView());
      this.m_views.push(new StubBetDownSwButtonView());
      this.m_views.push(new StubBetUpSwButtonView());
      this.m_views.push(new StubBetMenuView());
      this.m_views.push(new StubCoinsFreeSpinBarView());
      this.m_views.push(new StubCoinsWinBarView());
      this.m_views.push(new StubExitGameSwButtonView());
      this.m_views.push(new StubExtraFreeSpinBarView());
      this.m_views.push(new StubExtraSpinBarView());
      this.m_views.push(new StubFreeSpinBarView());
      this.m_views.push(new StubGambleBlackSwButtonView());
      this.m_views.push(new StubGambleRedSwButtonView());
      this.m_views.push(new StubHoldAndSpinBarView());
      this.m_views.push(new StubInfoSwButtonView());
      this.m_views.push(new StubKnobsView());
      this.m_views.push(new StubLanguageSwButtonView());
      this.m_views.push(new StubLineDownSwButtonView());
      this.m_views.push(new StubLineUpSwButtonView());
      this.m_views.push(new StubResponsibleSwButtonView());
      this.m_views.push(new StubSoundVolumeSwButtonView());
      this.m_views.push(new StubStatusLineView());
      this.m_views.push(new StubAutoPlayView());
      this.m_views.push(new StubStopSingleReelSwButtonView());
      this.m_views.push(new StubWheelRoundOverlayView());
      this.m_views.push(new StubWheelRoundView());
    }

    if (this.m_config.autoInput) {
      if (this.m_config.wheelStrategy) {
        // wheel strategy is to press take coins button when enabled
        this.m_views.push(new WheelStrategy_StubStartGameHwButton());
        this.m_views.push(new WheelStrategy_StubTakeCoinsSwButtonView());
      } else {
        // default strategy is to press start game button when enabled
        this.m_views.push(new StubStartGameHwButton());
        this.m_views.push(new StubTakeCoinsSwButtonView());
      }

      this.m_views.push(new StubWheelStartSwButtonView());
    }

    return true;
  }

  Start() {
    for (const v of this.m_views) v.Init(this.GetRuntime());

    return true;
  }

  Stop() {
    for (const v of this.m_views) v.Deinit(this.GetRuntime());
  }

  Deinit() {
    this.m_views = [];
    super.Deinit();
  }
}
