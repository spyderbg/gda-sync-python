// Egt::Game::AlphaFamily::ReelsViewConfig (BurningCrownTetraSpins10View/Views/ReelsView.data.h): the IData of the reels
// views (idata/<resolution>/ReelsView.json, TetraRoundView.json).

import type { SymbolId } from '../../../../libs/AlphaFamily/Math/Common/Common.data';
import type { Point, RssRect } from '../../../../../engine/Game/RuntimeExport/IResources';
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

export interface FlyingSymbolData {
  id: number;
  flyingRssId: string;
  stationaryRssId: string;
}

export interface FlyingSymbolsConfig {
  flyingTimeMS?: number;
  flyingSymbolData?: FlyingSymbolData[];
}

export interface LineVisualConfig {
  id: number;
  imageId: string;
  offset: Point;
  scale?: Point;
}

export interface LinesVisualConfig {
  fastShowEnd?: number;
  fastShowInterval?: number;
  slowShowEnd?: number;
  slowShowInterval?: number;
  shadowBlinkingInterval?: number;
  lines?: LineVisualConfig[];
  winSquareOffsets?: Point[];
  winSquareCutInset?: RssRect;
  winSquareRssKeys?: string[];
  winSquareScatterRssKey?: string;
  squareLightsRssKey?: string;
  squareLightsOffset?: Point;
  squareLightsScale?: Point;
}

export interface WinFiguresVisualConfig {
  wildFigureSymbolId?: number;
  wildSymbolAnimOffsetX?: number;
  wildSymbolAnimOffsetY?: number;
  figureScale?: Point;
  winFiguresRssKeys?: Record<SymbolId, string>;
  wildFiguresRssKeys?: Record<SymbolId, string>;
  singleWildFigureRssKey?: string;
}

export interface DimSubScreenVisualConfig {
  dimImageRssKeys?: Record<string, string>;
  dimImageOffset?: Point;
}

export interface ReelsViewConfig {
  symbolsConfig: SymbolVisualConfig[];
  expandingSymbolAnimationId?: string;
  reelSoundsConfig: ReelSoundsConfig;
  reelingParamsConfig: ReelingParamsConfig;
  subScreensConfig: ReelSubScreensConfig;
  flyingSymbolsConfig: FlyingSymbolsConfig;
  linesConfig: LinesVisualConfig;
  winFiguresConfig: WinFiguresVisualConfig;
  dimSubScreenConfig: DimSubScreenVisualConfig;
}
