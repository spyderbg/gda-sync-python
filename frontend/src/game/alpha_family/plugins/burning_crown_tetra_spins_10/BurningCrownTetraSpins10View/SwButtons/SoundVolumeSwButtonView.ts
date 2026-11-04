// Egt::Game::AlphaFamily::SoundVolumeSwButtonView (BurningCrownTetraSpins10View/SwButtons/SoundVolumeSwButtonView.h/.cpp):
// the sound button, one element for each volume preset, of which it shows the current one; a press shows the next
// volume's button 200 ms later. Main and Tetra buttons come from separate JSON elements.

import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import * as tweeny from '@game/hat_libs/tweeny/tweeny';
import type { DrawList } from '@game/engine/GameVideoCtrl/DrawList';
import { ButtonElement } from '@game/engine/GameVideoCtrl/ViewElements/ButtonElement';
import { IButtonViewEvents } from '@game/alpha_family/libs/AlphaFamily/Views/BaseInterfaces/IControlView';
import { ISoundVolumeSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';
import { ButtonView } from '@game/alpha_family/libs/AlphaFamilyVideoCtrl/Components/ButtonView';
import { ThemeLayout } from '../ThemeLayout';

const SoundVolumeSwButtonViewId = 'SoundVolumeSwButtonView';
const ButtonVolumeMuteId = 'button_volume_mute';
const ButtonVolumeL0Id = 'button_volume_l0';
const ButtonVolumeL1Id = 'button_volume_l1';
const ButtonVolumeL2Id = 'button_volume_l2';
const ButtonVolumeL3Id = 'button_volume_l3';
const ButtonVolumeIds = [ButtonVolumeMuteId, ButtonVolumeL0Id, ButtonVolumeL1Id, ButtonVolumeL2Id, ButtonVolumeL3Id];
const PressDelay = 200;

enum ESoundVolumePresentingState {
  Idle,
  InProgress,
}

export class SoundVolumeSwButtonView extends ButtonView implements ISoundVolumeSwButtonView {
  private m_presentingState = ESoundVolumePresentingState.Idle;
  private m_currentVolume = 0;
  private m_oldVolume = -1;
  private m_actionPress = new tweeny.tween_action();
  private readonly m_themeLayout = new ThemeLayout(this.m_elementsList, tweeny.ref(this, 'm_theme'));

  constructor() {
    super(SoundVolumeSwButtonViewId, ISoundVolumeSwButtonView, new IButtonViewEvents());
  }

  Init(runtime: Runtime) {
    super.Init(runtime);
    this.InitElementsList(SoundVolumeSwButtonViewId, () => this.OnElementsListLoaded());
    return true;
  }

  Deinit() {
    this.DeinitElementsList();
    super.Deinit();
  }

  Draw(drawList: DrawList) {
    if (this.IsHiddenByTheme()) return;
    super.Draw(drawList);
  }

  HandleTouchDown(x: number, y: number) {
    if (this.IsHiddenByTheme()) return false;
    return super.HandleTouchDown(x, y);
  }

  SetCurrentVolume(volume: number) {
    if (this.m_currentVolume === volume) return;
    this.m_currentVolume = volume;
    if (!this.m_elementsList.IsLoaded()) return;
    this.AdjustButtons();
  }

  SimulateButtonPress() {
    if (this.m_oldVolume === this.m_currentVolume) return;
    this.m_oldVolume = this.m_currentVolume;
    super.SimulateButtonPress();
    tweeny.start(this.m_actionPress, 'SoundVolumeSwButtonView/SimulateButtonPress');
  }

  private OnElementsListLoaded() {
    this.InitAnimations();
  }

  private InitAnimations() {
    this.m_actionPress = tweeny.delay(PressDelay);
    this.m_actionPress.on_begin.connect(() => {
      this.m_presentingState = ESoundVolumePresentingState.InProgress;
    });
    this.m_actionPress.on_end.connect(() => {
      this.m_presentingState = ESoundVolumePresentingState.Idle;
      this.AdjustButtons();
    });
  }

  protected OnThemeChanged() {
    this.m_themeLayout.Apply();
    this.AdjustButtons();
  }

  private AdjustButtons() {
    if (this.m_presentingState !== ESoundVolumePresentingState.Idle) return;
    const presetCount = this.RuntimeGetConst(IAudioApi).GetVolumePresetCount();
    if (presetCount === 0) {
      for (const buttonId of ButtonVolumeIds) {
        const button = this.m_elementsList.Get(this.m_themeLayout.ElementId(buttonId), ButtonElement);
        button.SetEnabled(false);
        button.SetHidden(true);
      }
      return;
    }
    const maxPresetIndex = presetCount - 1;
    const maxButtonIndex = ButtonVolumeIds.length - 1;
    const buttonIndex = Math.min(Math.max(maxButtonIndex - maxPresetIndex + this.m_currentVolume, 0), maxButtonIndex);
    for (let idx = 0; idx <= maxButtonIndex; ++idx) {
      const buttonId = this.m_themeLayout.ElementId(ButtonVolumeIds[idx]);
      const button = this.m_elementsList.Get(buttonId, ButtonElement);
      if (idx === buttonIndex) {
        button.SetEnabled(true);
        button.SetHidden(false);
        this.SetButtonId(buttonId);
      } else {
        button.SetEnabled(false);
        button.SetHidden(true);
      }
    }
  }

  /** The theme's JSON hides the buttons (Tetra's): the view draws nothing and takes no touch. */
  private IsHiddenByTheme() {
    return this.m_elementsList.IsLoaded() && !this.m_themeLayout.IsShown(this.m_buttonId);
  }
}
