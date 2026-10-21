// The AudioManager module (plugins/src/Egt/AudioManager): provides IAudioApi, which plays the audio events of
// RssAudioData.json by id, one of an event's samples at a time; an event of a polyphony group stops the group's other
// sounds. The volume presets cycle with the sound button.

import { IAudioApi, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

const VOLUME_PRESETS = [0, 0.25, 0.5, 1];

class AudioPlayback implements IAudioPlayback {
  constructor(readonly audio: HTMLAudioElement, readonly group: string | undefined) {}

  Stop() {
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  IsPlaying() {
    return !this.audio.paused && !this.audio.ended;
  }
}

export class AudioManager extends BaseModule implements IAudioApi {
  private playing: AudioPlayback[] = [];
  private volumeIndex = 2;
  private readonly missing = new Set<string>();

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.RuntimeAdd(IAudioApi, this);
    return true;
  }

  Deinit() {
    this.StopAll();
    this.RuntimeRemove(IAudioApi);
    super.Deinit();
  }

  Play(audioEventId: string): IAudioPlayback | null {
    if (!audioEventId) return null;
    const event = this.RuntimeGet(IResources).GetAudioEvent(audioEventId);
    if (!event || !event.files.length) {
      this.missing.add(audioEventId);
      return null;
    }
    if (event.polyphonyGroup) {
      for (const playback of this.playing) if (playback.group === event.polyphonyGroup) playback.Stop();
    }
    const file = event.files[Math.floor(Math.random() * event.files.length)];
    const audio = new Audio(this.RuntimeGet(IResources).FileUrl(file));
    audio.loop = !!event.loop;
    audio.volume = VOLUME_PRESETS[this.volumeIndex];
    const playback = new AudioPlayback(audio, event.polyphonyGroup);
    this.playing = this.playing.filter(item => item.IsPlaying());
    this.playing.push(playback);
    if (audio.volume > 0) audio.play().catch(() => {});
    return playback;
  }

  StopAll() {
    for (const playback of this.playing) playback.Stop();
    this.playing = [];
  }

  /** Audio events the game played that no descriptor declares. */
  MissingEvents() {
    return [...this.missing];
  }

  GetVolumePresetCount() {
    return VOLUME_PRESETS.length;
  }

  GetCurrentVolumePresetIndex() {
    return this.volumeIndex;
  }

  ApplyVolumePreset(index: number) {
    this.volumeIndex = Math.max(0, Math.min(VOLUME_PRESETS.length - 1, index));
    for (const playback of this.playing) playback.audio.volume = VOLUME_PRESETS[this.volumeIndex];
  }

  CycleVolumePreset() {
    this.ApplyVolumePreset((this.volumeIndex + 1) % VOLUME_PRESETS.length);
  }
}
