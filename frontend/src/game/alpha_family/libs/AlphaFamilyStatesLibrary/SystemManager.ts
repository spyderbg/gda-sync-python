// Egt::Game::AlphaFamily::SystemManager (AlphaFamilyStatesLibrary/SystemManager.h/.cpp): the root state; pending
// cashout and exit, the sound volume and the language.

import { State } from '@game/engine/Fsm/Fsm';
import { IAudioApi } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { ILocalization } from '@game/engine/Game/RuntimeImport/ILocalization';
import { IWallet, type TransactionInfo } from '@game/engine/Game/RuntimeImport/IWallet';
import { Unless } from '@game/engine/GameCore/Common/Defensive';
import { type int, type size_t, static_cast } from '@game/engine/GameCore/Common/Types';
import { EgtADebug, EgtALogCategoryClass, EgtATrace } from '@game/engine/GameCore/Log/LogCategory';
import { ISystemManager, SystemManagerNvrams, SystemManagerStatics } from '@game/alpha_family/libs/AlphaFamily/States/ISystemManager';
import { IInfoView } from '@game/alpha_family/libs/AlphaFamily/Views/IInfoView.bridge';
import { ILanguageMenuView, ISoundMenuView } from '@game/alpha_family/libs/AlphaFamily/Views/IMenuViews.bridge';
import { IStatusLineView } from '@game/alpha_family/libs/AlphaFamily/Views/IStatusLineView.bridge';
import { ISoundVolumeSwButtonView } from '@game/alpha_family/libs/AlphaFamily/Views/SwButtonViews.bridge';

export class SystemManager extends State implements ISystemManager {
  static Interfaces = [ISystemManager, ISystemManager.Events];
  static Nvrams = [SystemManagerNvrams];
  static Statics = [SystemManagerStatics];

  // State
  OnTransit(_isStartup: boolean, _isRecovery: boolean) {
    EgtATrace('OnTransit {} {}', _isStartup ? 'isStartup' : '', _isRecovery ? 'isRecovery' : '');

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
    if (Unless(this.RuntimeGetConst(IAudioApi).GetVolumePresetCount() >= 2)) return this.Reject();

    this.RuntimeGet(IAudioApi).CycleVolumePreset();
    this.RefreshSoundVolumeViews();
    return this.Consume();
  }

  OnRequestLanguageChange(language: string) {
    this.RuntimeGet(ILocalization).SetLanguage(language);

    return this.Consume();
  }

  OnRequestVolumeChange(volume: int) {
    // TODO: fix missleading "int volume" arguments
    const volumePresetIndex = static_cast<size_t>(volume);
    if (volumePresetIndex === this.RuntimeGetConst(IAudioApi).GetCurrentVolumePresetIndex()) return this.Skip();

    this.RuntimeGet(IAudioApi).ApplyVolumePreset(volumePresetIndex);
    this.RefreshSoundVolumeViews();
    return this.Consume();
  }

  OnLanguageChanged(language: string) {
    EgtADebug('OnLanguageChanged language = {}', language);

    this.UpdateViewsLanguage(language);

    return this.Forward();
  }

  private GetVolumePresetIndices() {
    const presetCount = this.RuntimeGetConst(IAudioApi).GetVolumePresetCount();

    const result: int[] = [];
    for (let index: size_t = 0; index < presetCount; ++index) {
      result.push(static_cast<int>(index));
    }
    return result;
  }

  private RefreshSoundVolumeViews() {
    let volumePresetIndex = static_cast<int>(this.RuntimeGetConst(IAudioApi).GetCurrentVolumePresetIndex());

    // TODO: fix missleading "int volume" arguments
    const soundView = this.RuntimeGet(ISoundMenuView);
    soundView.SetPossibleVolumes(this.GetVolumePresetIndices());
    soundView.SetCurrentVolume(volumePresetIndex);

    // TODO: fix missleading "int volume" arguments
    const soundBtnView = this.RuntimeGet(ISoundVolumeSwButtonView);
    soundBtnView.SetCurrentVolume(volumePresetIndex);
  }

  private InitLanguageOptions() {
    const localizationManager = this.RuntimeGet(ILocalization);

    let possibleLanguages = localizationManager.GetSupportedLanguages();
    this.RuntimeGet(ILanguageMenuView).SetPossibleLanguages(possibleLanguages);

    this.UpdateViewsLanguage(localizationManager.GetLanguage());
  }

  private UpdateViewsLanguage(language: string) {
    this.RuntimeGet(ILanguageMenuView).SetLanguage(language);
    this.RuntimeGet(IInfoView).SetLanguage(language);
    this.RuntimeGet(IStatusLineView).SetLanguage(language);
  }
}

EgtALogCategoryClass(SystemManager, 'SystemManager');
