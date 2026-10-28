// Egt::Game::AlphaFamily::WinFiguresViewConfig (NordicRushView/Views/WinFiguresView.data.h): the IData of the win
// figures view (idata/<resolution>/WinFiguresView.json).

import type { ReelSubScreensConfig } from './ReelSubScreen.data';
import type { WinFiguresVisualConfig } from '../Visuals/WinFiguresVisual.data';

export interface WinFiguresViewConfig {
  subScreensConfig: ReelSubScreensConfig;

  winFiguresConfig: WinFiguresVisualConfig;
}
