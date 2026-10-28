// Egt::Game::AlphaFamily::HoldAndSpinPhase (AlphaFamily/Math/HoldAndSpin/HoldAndSpinRoundPhase.data.h).

import { PayoutSummary, type SymbolGrid, type SymbolViewInfos } from '../Common/Common.data';

export class HoldAndSpinPhase {
  stop: SymbolGrid = [];
  winFiguresInfo: SymbolViewInfos = [];
  summary = new PayoutSummary();
}

export type HoldAndSpinPhases = HoldAndSpinPhase[];
