// Egt::Game::AlphaFamily::ReelsViewConfig (JokerReelsCoins10View/Views/ReelsView.data.h): the IData of the reels
// view (idata/<resolution>/ReelsView.json).

import type { ReelSubScreensConfig } from './ReelSubScreen.data';

export interface SymbolVisualConfig {
  id: number;
  rssId: string;
  name: string; // used by imgui
  hue: number; // used by imgui
}

// ReelStopSoundConfig::ECategory; its values are the IData's
export enum ECategory {
  None = 'None',
  Default = 'Default',
  Scatter = 'Scatter',
  ExpandingWild = 'ExpandingWild',
}

export interface ReelStopSoundConfig {
  category: ECategory;
  stopIndex: number;
  soundId: string;
}

export interface ReelSoundsConfig {
  stopSoundsConfig: ReelStopSoundConfig[];
  startReelingSoundId: string;
  allReelingSoundId: string;
  attractionSoundId?: string;
  expandingSymbolSoundId?: string;
}

export interface ReelingParamsConfig {
  tickDuration: number; // [ms]
  introDeltaPosPerTick: number[];
  outroDeltaPosPerTick: number[];
  normalDeltaPosPerTick: number;
  attractionDeltaPosPerTick: number;
  reelingMinDurationTicks: number;
  reelingAdditionalTicks: number;
  reelingAttractionAdditionalTicks: number;
  allStoppedDelay: number; // [ms]
  wildSymbolId: number;
}

export interface ReelsViewConfig {
  symbolsConfig: SymbolVisualConfig[];
  expandingSymbolAnimationId?: string;
  reelSoundsConfig: ReelSoundsConfig;
  reelingParamsConfig: ReelingParamsConfig;
  subScreensConfig: ReelSubScreensConfig;
}
