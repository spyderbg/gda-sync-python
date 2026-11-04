// Egt::Game::AlphaFamily::ExitGameSwButtonView (BurningCrownTetraSpins10View/SwButtons/ExitGameSwButtonView.h/.cpp): the
// home button: requests the exit, then tells the game when the exit has been presented. In the Tetra theme the button
// stays drawn while the state hides its view, though disabled, as the Tetra match does not exit.

import { CountdownTimer } from '@game/engine/Game/Utils/CountdownTimer';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import { IExitGameSwButtonView, IExitGameSwButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { ThemeLayout } from '../ThemeLayout';

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
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

  constructor() {
    super(ExitGameSwButtonViewId, IExitGameSwButtonView, new IExitGameSwButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(ExitGameSwButtonViewId);
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
    if (this.IsVisible() || !this.m_themeLayout.IsTetra()) {
      super.ReloadElementsList();
      return;
    }

    this.DeinitElementsList();
    this.InitElementsList(ExitGameSwButtonViewId);
    // (C++ loads the list here: the browser's InitElementsList loads it)
  }

  Draw(drawList: DrawList) {
    if (!this.m_themeLayout.IsTetra()) {
      super.Draw(drawList);
      return;
    }

    // (C++ refreshes the list's resources here, which loads it: the browser's elements list loads in Init)
    if (!this.m_elementsList.IsLoaded()) return;

    const button = this.m_elementsList.Get(this.m_themeLayout.ElementId(ButtonExitGameId), ButtonElement);
    button.SetHidden(false);
    button.SetEnabled(false);
    this.m_elementsList.Draw(drawList);
  }

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
    this.SetButtonId(this.m_themeLayout.ElementId(ButtonExitGameId));
  }
}
