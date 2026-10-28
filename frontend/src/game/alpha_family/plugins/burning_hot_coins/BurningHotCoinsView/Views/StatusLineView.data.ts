// Egt::Game::AlphaFamily::StatusLineViewConfig (BurningHotCoinsView/Views/StatusLineView.data.h): the IData of
// the status line (idata/<resolution>/StatusLineView.json).

import type { Point } from '@game/engine/Game/RuntimeExport/IResources';
import type { Alignment } from '@game/engine/GameVideoCtrl/ViewElements/BaseElement';
import type { StatusLineVisualConfig } from '../Visuals/StatusLineVisual.data';

export interface StatusLineViewConfig {
  cycleDuration?: number; // [ms]
  cycleStart?: number; // [ms]
  fastLineEnd?: number; // [ms]
  fastLineInterval?: number; // [ms]
  slowLineEnd?: number; // [ms]
  slowLineInterval?: number; // [ms]

  midPoint?: Point; // info position when no round info
  midPointAlignment?: Alignment;

  visualConfig: StatusLineVisualConfig;
}
