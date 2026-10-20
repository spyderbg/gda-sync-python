// Egt::Game::IAudioApi: plays the descriptors' audio events by id.

import { Interface } from '../../GameCore/RuntimeAccess';

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

export const IAudioApi = Interface<IAudioApi>('IAudioApi');
