// Egt::Game::AlphaFamily::ReelsViewConfig (NordicRushView/Views/ReelsView.data.h): the IData of the reels
// view (idata/<resolution>/ReelsView.json).

import type { ReelSubScreensConfig } from './ReelSubScreen.data';

export interface SymbolVisualTextOverlayConfig {
  text: string;
  styleId: string;
  ox: number;
  oy: number;
}

export interface SymbolVisualImageOverlayConfig {
  rssId: string;
  ox: number;
  oy: number;
}

export interface SymbolVisualConfig {
  id: number;
  rssId: string;
  overlayImage?: SymbolVisualImageOverlayConfig; // overlay image above
  overlayText?: SymbolVisualTextOverlayConfig; // overlay text above
  name: string; // used by imgui
  hue: number; // used by imgui
}

// ReelStopSoundConfig::ECategory; its values are the IData's
export enum ECategory {
  None = 'None',
  Default = 'Default',
  Scatter = 'Scatter',
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
}

export interface ReelsViewConfig {
  symbolsConfig: SymbolVisualConfig[];
  reelSoundsConfig: ReelSoundsConfig;
  reelingParamsConfig: ReelingParamsConfig;
  subScreensConfig: ReelSubScreensConfig;
}
