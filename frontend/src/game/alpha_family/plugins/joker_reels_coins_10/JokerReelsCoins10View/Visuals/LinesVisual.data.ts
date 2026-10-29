// Egt::Game::AlphaFamily::LinesVisualConfig and LineImageInfo (JokerReelsCoins10View/Visuals/LinesVisual.data.h): how
// the win lines and their win squares are drawn.

import type { Point, RssRect } from '@game/engine/Game/RuntimeExport/IResources';

export interface LineImageInfo {
  id: number;
  offset: Point;
  scale?: Point;
  imageId: string;
}

export interface LinesVisualConfig {
  fastShowEnd?: number; // [ms]
  fastShowInterval?: number; // [ms]
  slowShowEnd?: number; // [ms]
  slowShowInterval?: number; // [ms]
  shadowBlinkingInterval?: number; // [ms]

  lines?: LineImageInfo[];

  winSquareOffsets?: Point[];
  winSquareCutInset?: RssRect;
  winSquareRssKeys?: string[];
  winSquareScatterRssKey?: string;

  squareLightsRssKey?: string;
  squareLightsOffset?: Point;
  squareLightsScale?: Point;
}
