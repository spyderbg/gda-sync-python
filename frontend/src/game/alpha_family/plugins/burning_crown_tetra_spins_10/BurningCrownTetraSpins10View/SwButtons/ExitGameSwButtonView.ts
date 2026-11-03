// Egt::Game::AlphaFamily::ExitGameSwButtonView (BurningCrownTetraSpins10View/SwButtons/ExitGameSwButtonView.h/.cpp): the
// home button: requests the exit, then tells the game when the exit has been presented.

import { CountdownTimer } from '@game/engine/Game/Utils/CountdownTimer';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { IExitGameSwButtonView, IExitGameSwButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { PanelElementsList } from '../PanelElementsList';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';

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
  protected readonly m_elementsList = new PanelElementsList();
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

  ReloadElementsList() {
    if (this.IsVisible() || !this.m_elementsList.IsTetraLayout()) { super.ReloadElementsList(); return; }
    // Tetra draws Home even when the state hides its exit control.
    if (this.m_elementsList.UpdateFromResource()) return;
    this.DeinitElementsList();
    this.InitElementsList(ExitGameSwButtonViewId, () => this.SetButtonId(ButtonExitGameId));
  }

  Draw(drawList: DrawList) {
    if (!this.m_elementsList.IsTetraLayout()) { super.Draw(drawList); return; }
    // The reference keeps Home drawn; the state machine still prevents leaving
    // the game while the Tetra match is open.
    const button = this.m_elementsList.Get(ButtonExitGameId, ButtonElement);
    button.SetHidden(false).SetEnabled(false);
    this.m_elementsList.Draw(drawList);
  }
}
