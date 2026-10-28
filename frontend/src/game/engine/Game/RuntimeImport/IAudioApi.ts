// Egt::Game::IAudioApi: plays the descriptors' audio events by id.

import { Event } from '@game/engine/Core/Event';
import { Interface } from '@game/engine/GameCore/RuntimeAccess';

export interface IAudioPlayback {
  Stop(): void;
  IsPlaying(): boolean;
}

export interface IAudioApi {
  Play(audioEventId: string): IAudioPlayback | null;
  StopAll(): void;
  GetVolumePresetCount(): number;
  GetCurrentVolumePresetIndex(): number;
  ApplyVolumePreset(index: number): void;
  CycleVolumePreset(): void;
}

export class IAudioApiEvents {
  /** Emitted after a named sound starts successfully. */
  readonly playbackStarted = new Event<[string, IAudioPlayback]>();

  /** Emitted when the current volume preset changes, either via ApplyVolumePreset() or CycleVolumePreset(). */
  readonly volumePresetChanged = new Event<[number]>();
}

export const IAudioApi = Interface<IAudioApi, IAudioApiEvents>('IAudioApi');
