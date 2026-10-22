// Egt::Game::AlphaFamily::WinFiguresVisualConfig (NordicRushView/Visuals/WinFiguresVisual.data.h): the win figure of
// each symbol, with the overlays drawn above it and the cometlike effect it sends (idata/<resolution>/WinFiguresView.json).

import type { SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';

export interface WinFigureTextOverlayConfig {
  text: string;
  styleId: string;
  ox: number;
  oy: number;
}

export interface WinFigureImageOverlayConfig {
  rssId: string;
  ox: number;
  oy: number;
}

export interface WinFigureConfig {
  id: SymbolId; // symbol id
  rssId: string; // image sequence or movie rss id
  overlayImage?: WinFigureImageOverlayConfig; // overlay image above
  overlayText?: WinFigureTextOverlayConfig; // overlay text above
  effectId?: string; // rss id for cometlike effect
  effectValue?: number; // for cometlike effect, how much the collected value to be increased, int(overlayText)
}

export interface WinFiguresVisualConfig {
  winFigures: WinFigureConfig[];
}
