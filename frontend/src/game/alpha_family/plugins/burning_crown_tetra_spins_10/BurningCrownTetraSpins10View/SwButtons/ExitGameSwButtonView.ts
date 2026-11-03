// Egt::Game::AlphaFamily::ExitGameSwButtonView (BurningCrownTetraSpins10View/SwButtons/ExitGameSwButtonView.h/.cpp): the
// home button: requests the exit, then tells the game when the exit has been presented.

import { CountdownTimer } from '@game/engine/Game/Utils/CountdownTimer';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { IExitGameSwButtonView, IExitGameSwButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { PanelLayout } from '../PanelLayout';
import { GameBackgroundViewToken } from '../Views/GameBackgroundView';

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
  private readonly m_panelLayout = new PanelLayout(this.m_elementsList);

  constructor() {
    super(ExitGameSwButtonViewId, IExitGameSwButtonView, new IExitGameSwButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(ExitGameSwButtonViewId, () => this.ApplyPanelLayout());
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Process() {
    super.Process();
    if (this.m_panelLayout.Update(this.RuntimeTryGetConst(GameBackgroundViewToken)) && this.m_elementsList.IsLoaded()) {
      this.ApplyPanelLayout();
    }
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
    if (this.IsVisible() || !this.m_panelLayout.IsTetra()) {
      super.ReloadElementsList();
      return;
    }
    // Tetra draws Home while the state hides it (Draw), so its elements reload while it is hidden too
    if (this.m_elementsList.UpdateFromResource()) return;
    this.DeinitElementsList();
    this.InitElementsList(ExitGameSwButtonViewId, () => this.ApplyPanelLayout());
  }

  Draw(drawList: DrawList) {
    if (!this.m_panelLayout.IsTetra() || !this.m_elementsList.IsLoaded()) {
      super.Draw(drawList);
      return;
    }
    // Tetra's artwork keeps Home drawn, though disabled: the state machine does not let the Tetra match exit
    const button = this.m_elementsList.Get(this.m_panelLayout.ElementId(ButtonExitGameId), ButtonElement);
    button.SetHidden(false);
    button.SetEnabled(false);
    this.m_elementsList.Draw(drawList);
  }

  private ApplyPanelLayout() {
    this.m_panelLayout.Apply();
    this.SetButtonId(this.m_panelLayout.ElementId(ButtonExitGameId));
  }
}
