// Egt::Game::AlphaFamily::BaseReelsView (NordicRushView/Views/BaseReelsView.h/.cpp): what a ReelVisual
// asks of the view that owns it.

import type { IAudioPlayback } from '@game/engine/Game/RuntimeImport/IAudioApi';
import type { ReelsViewConfig } from './ReelsView.data';

export interface BaseReelsView {
  IsHiddenSymbol(reelIdx: number, row: number): boolean;
  PlayStopSound(subScreen: number, reelIdx: number): void;
  PlayAttractionSound(): void;
  StopAttractionSound(): void;
  GetReelsViewConfig(): ReelsViewConfig;
  GetStoppedReelIds(): number[];
  GetStoppedReelIdxs(subScreen: number): number[];
  GetReelsCount(subScreenIdx: number): number;
  OnReelStopped(subScreenIdx: number, reelIdx: number): void;
}

export interface BaseReelsViewSounds {
  m_pendingAllReelingSound: boolean;
  m_allReelingPlayback: IAudioPlayback | null;
  m_attractionPlayback: IAudioPlayback | null;
}
