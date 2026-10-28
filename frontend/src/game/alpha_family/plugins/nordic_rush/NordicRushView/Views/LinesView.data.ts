// Egt::Game::AlphaFamily::LinesViewConfig (NordicRushView/Views/LinesView.data.h): the IData of the lines view
// (idata/<resolution>/LinesView.json).

import type { SymbolId } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { LinesVisualConfig } from '../Visuals/LinesVisual.data';
import type { ReelSubScreen } from './ReelSubScreen.data';

export interface LinesViewConfig extends LinesVisualConfig {
  fastShowStart?: number; // [ms]
  slowShowStart?: number; // [ms]
  autoPlayIdleTimer?: number; // [ms]

  subScreen: ReelSubScreen;

  winFiguresDefaultSoundRssKeys?: Record<SymbolId, string>;
  winFiguresX5SoundRssKeys?: Record<SymbolId, string>;
}
