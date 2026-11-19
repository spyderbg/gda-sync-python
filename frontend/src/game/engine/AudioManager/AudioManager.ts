// The AudioManager module (plugins/src/Egt/AudioManager): provides IAudioApi, which plays the audio events of
// RssAudioData.json by id, one of an event's samples at a time; an event of a polyphony group stops the group's other
// sounds. The volume presets cycle with the sound button. The game pause (IPause) pauses every sound and resumes it,
// and a sound played while paused starts paused (C++'s OnGamePaused, OnGameResumed and Play).

import { IAudioApi, IAudioApiEvents, type IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { IPause } from '@game/engine/Game/RuntimeImport/IPause';
import { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';

const VOLUME_PRESETS = [0, 0.25, 0.5, 1];

class AudioPlayback implements IAudioPlayback {
  /** Held by the game pause: it plays on when the game resumes. */
  pausedByGame = false;

  constructor(readonly audio: HTMLAudioElement, readonly group: string | undefined) {}

  Stop() {
    this.pausedByGame = false;
    this.audio.pause();
    this.audio.currentTime = 0;
  }

  IsPlaying() {
    return this.pausedByGame || (!this.audio.paused && !this.audio.ended);
  }

  /** audio_player's pause of a sound. */
  Pause() {
    if (!this.IsPlaying()) return;
    this.pausedByGame = true;
    this.audio.pause();
  }

  /** audio_player's resume of a sound. */
  Resume() {
    if (!this.pausedByGame) return;
    this.pausedByGame = false;
    if (this.audio.volume > 0) this.audio.play().catch(() => {});
  }
}

export class AudioManager extends BaseModule implements IAudioApi {
  private readonly events = new IAudioApiEvents();
  private playing: AudioPlayback[] = [];
  private volumeIndex = 2;
  private readonly missing = new Set<string>();

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.RuntimeAdd(IAudioApi, this);
    this.RuntimeAdd(IAudioApi.Events, this.events);

    const pause = this.RuntimeTryGetConst(IPause.Events);
    if (pause) {
      pause.paused.RegisterInstant(this, () => this.OnGamePaused());
      pause.resumed.RegisterInstant(this, () => this.OnGameResumed());
    }

    return true;
  }

  private OnGamePaused() {
    for (const playback of this.playing) playback.Pause();
  }

  private OnGameResumed() {
    for (const playback of this.playing) playback.Resume();
  }

  Deinit() {
    const pause = this.RuntimeTryGetConst(IPause.Events);
    pause?.paused.Unregister(this);
    pause?.resumed.Unregister(this);
    this.StopAll();
    this.RuntimeRemove(IAudioApi);
    this.RuntimeRemove(IAudioApi.Events);
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
    const pause = this.RuntimeTryGetConst(IPause);
    if (pause && pause.IsPaused()) {
      playback.Pause();
    }
    this.events.playbackStarted.Post(audioEventId, playback);
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
    this.events.volumePresetChanged.Post(this.volumeIndex);
  }

  CycleVolumePreset() {
    this.ApplyVolumePreset((this.volumeIndex + 1) % VOLUME_PRESETS.length);
  }
}
