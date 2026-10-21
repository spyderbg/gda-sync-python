// Egt::Game::AlphaFamily::SystemManager (AlphaFamilyStatesLibrary/SystemManager.h/.cpp): the root state; pending
// cashout and exit, the sound volume and the language.

import { State } from '@game/engine/Fsm/Fsm';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IWallet, type TransactionInfo } from '@game/engine/Game/RuntimeImport/IWallet';
import { ISystemManager, SystemManagerNvrams, SystemManagerStatics } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILanguageMenuView, ISoundMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { ISoundVolumeSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class SystemManager extends State implements ISystemManager {
  static Interfaces = [ISystemManager, ISystemManager.Events];
  static Nvrams = [SystemManagerNvrams];
  static Statics = [SystemManagerStatics];

  OnTransit() {
    this.ReactOn(this.RuntimeGetConst(IWallet.Events).onCreditChanged, this.OnCreditChanged);
    this.ReactOn(this.RuntimeGetConst(ISoundVolumeSwButtonView.Events).buttonPressedEvent, this.OnSoundVolumeSwButtonPressed);
    this.ReactOn(this.RuntimeGetConst(ILanguageMenuView.Events).requestLanguageChange, this.OnRequestLanguageChange);
    this.ReactOn(this.RuntimeGetConst(ISoundMenuView.Events).requestVolumeChange, this.OnRequestVolumeChange);
    // ILocalization
    this.ReactOn(this.RuntimeGetConst(ILocalization.Events).languageChanged, this.OnLanguageChanged);
    this.RefreshSoundVolumeViews();
    this.InitLanguageOptions();
  }

  HasPendingCashout() {
    return this.Static(SystemManagerStatics).hasPendingCashout;
  }

  HasPendingExit() {
    return this.Static(SystemManagerStatics).hasPendingExit;
  }

  RequestPendingCashout() {
    this.Static(SystemManagerStatics).hasPendingCashout = true;
  }

  RequestPendingExit() {
    this.Static(SystemManagerStatics).hasPendingExit = true;
  }

  ClearPendingCashout() {
    this.Static(SystemManagerStatics).hasPendingCashout = false;
  }

  ClearPendingExit() {
    this.Static(SystemManagerStatics).hasPendingExit = false;
  }

  OnCreditChanged(_info: TransactionInfo) {
    return this.Skip();
  }

  OnSoundVolumeSwButtonPressed() {
    if (this.RuntimeGetConst(IAudioApi).GetVolumePresetCount() < 2) return this.Reject();
    this.RuntimeGet(IAudioApi).CycleVolumePreset();
    this.RefreshSoundVolumeViews();
    return this.Consume();
  }

  OnRequestLanguageChange(language: string) {
    this.RuntimeGet(ILocalization).SetLanguage(language);
    return this.Consume();
  }

  OnRequestVolumeChange(volume: number) {
    if (volume === this.RuntimeGetConst(IAudioApi).GetCurrentVolumePresetIndex()) return this.Skip();
    this.RuntimeGet(IAudioApi).ApplyVolumePreset(volume);
    this.RefreshSoundVolumeViews();
    return this.Consume();
  }

  OnLanguageChanged(language: string) {
    this.UpdateViewsLanguage(language);
    return this.Forward();
  }

  private GetVolumePresetIndices() {
    return Array.from({ length: this.RuntimeGetConst(IAudioApi).GetVolumePresetCount() }, (_, index) => index);
  }

  private RefreshSoundVolumeViews() {
    const volumePresetIndex = this.RuntimeGetConst(IAudioApi).GetCurrentVolumePresetIndex();
    const soundView = this.RuntimeGet(ISoundMenuView);
    soundView.SetPossibleVolumes(this.GetVolumePresetIndices());
    soundView.SetCurrentVolume(volumePresetIndex);
    this.RuntimeGet(ISoundVolumeSwButtonView).SetCurrentVolume(volumePresetIndex);
  }

  private InitLanguageOptions() {
    const localization = this.RuntimeGet(ILocalization);
    this.RuntimeGet(ILanguageMenuView).SetPossibleLanguages(localization.GetSupportedLanguages());
    this.UpdateViewsLanguage(localization.GetLanguage());
  }

  private UpdateViewsLanguage(language: string) {
    this.RuntimeGet(ILanguageMenuView).SetLanguage(language);
    this.RuntimeGet(IInfoView).SetLanguage(language);
    this.RuntimeGet(IStatusLineView).SetLanguage(language);
  }
}
