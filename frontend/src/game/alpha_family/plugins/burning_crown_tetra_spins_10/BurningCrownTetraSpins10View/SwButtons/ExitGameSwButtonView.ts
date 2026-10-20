// Egt::Game::AlphaFamily::ExitGameSwButtonView (BurningCrownTetraSpins10View/SwButtons/ExitGameSwButtonView.h/.cpp): the
// home button: requests the exit, then tells the game when the exit has been presented.

import { CountdownTimer } from '../../../../../engine/Game/Utils/CountdownTimer';
import { IAudioApi } from '../../../../../engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '../../../../../engine/GameCore/RuntimeAccess';
import { IExitGameSwButtonView, IExitGameSwButtonViewEvents } from '../../../../libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '../../../../libs/AlphaFamilyVideoCtrl/Components/ButtonView';

const ExitGameSwButtonViewId = 'ExitGameSwButtonView';
const ButtonExitGameId = 'button_exit_game';
const SoundExitId = 'SOUND_PANEL_SUPREME_COMMON_GAMES_EXIT';
const DelayBeforeExit = 800;

enum EExitPresentingState {
  Idle,
  InProgress,
  Finished,
}

export class ExitGameSwButtonView extends ButtonView<IExitGameSwButtonViewEvents> {
  protected m_presentingState = EExitPresentingState.Idle;
  protected m_exitTimer = new CountdownTimer();

  constructor() {
    super(ExitGameSwButtonViewId, IExitGameSwButtonView, new IExitGameSwButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(ExitGameSwButtonViewId, () => this.SetButtonId(ButtonExitGameId));
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    if (this.m_presentingState === EExitPresentingState.InProgress && this.m_exitTimer.IsExpired()) {
      this.m_events.exitPresentingFinished.Post();
      this.m_presentingState = EExitPresentingState.Finished;
    }
  }

  SimulateButtonPress() {
    if (this.m_presentingState === EExitPresentingState.Finished) this.m_presentingState = EExitPresentingState.Idle;
    if (this.m_presentingState !== EExitPresentingState.Idle) return;
    super.SimulateButtonPress();
    this.RuntimeGet(IAudioApi).Play(SoundExitId);
    this.m_exitTimer.SetDuration(DelayBeforeExit);
    this.m_exitTimer.Start();
    this.m_presentingState = EExitPresentingState.InProgress;
  }
}
