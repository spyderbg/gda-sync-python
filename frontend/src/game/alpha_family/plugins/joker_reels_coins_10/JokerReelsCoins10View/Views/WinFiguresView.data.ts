// Egt::Game::AlphaFamily::WinFiguresViewConfig (JokerReelsCoins10View/Views/WinFiguresView.data.h): the IData of the win
// figures view (idata/<resolution>/WinFiguresView.json).

import type { WinFiguresVisualConfig } from '../Visuals/WinFiguresVisual.data';
import type { ReelSubScreensConfig } from './ReelSubScreen.data';

export interface WinFiguresViewConfig {
  subScreensConfig: ReelSubScreensConfig;

  winFiguresConfig: WinFiguresVisualConfig;
}
