// Egt::Game::AlphaFamily::SpinRules (AlphaFamily/Math/Reel/Rules/SpinRules.h/.cpp): choose a reel set and stop the reels.

import { RngOp } from '../../../../../../engine/GameCore/Random/IRng';
import { RoundConfigError } from '../../Common/Exceptions';
import type { SymbolGrid } from '../../Common/Common.data';
import { SelectRandomIndex, SelectRandomValue, SelectValueFromIndex } from '../../Common/Weighted';
import type { ReelRoundRules } from '../ReelRoundRules';
import { SpinReelsPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { SpinRulesConfig } from './SpinRules.data';

export class SpinRules extends BaseReelRules {
  constructor(roundRules: ReelRoundRules, readonly m_config: SpinRulesConfig) {
    super(roundRules);
  }

  GetConfig() {
    return this.m_config;
  }

  SelectReels(context: Context, spinPhase: SpinReelsPhase) {
    const candidates = this.m_config.weightedReels;
    if (candidates.range.length >= 2) spinPhase.reels = SelectRandomValue(candidates, context.mathRng);
    else if (candidates.range.length === 1) spinPhase.reels = SelectValueFromIndex(candidates, 0);
    else throw new RoundConfigError('SpinRules::SelectReels zero candidates!');
  }

  StopReels(context: Context, spinPhase: SpinReelsPhase) {
    spinPhase.reelsOffset = spinPhase.reels.map(reel => context.mathRng.Generate(RngOp.StopReels, reel.length));
    spinPhase.initialStop = BaseReelRules.CopyFromReelsToGrid(spinPhase.reels, spinPhase.reelsOffset, this.GetRoundRules().GetRowsCount());
    this.ReplaceSymbols(context, spinPhase);
    this.IncludeRowsAroundStop(context, spinPhase);
    spinPhase.stop = spinPhase.initialStop.map(column => [...column]);
  }

  ReplaceSymbols(context: Context, spinPhase: SpinReelsPhase) {
    const stop = spinPhase.initialStop;
    const maps = this.m_config.replaceMaps;
    // don't roll if no replace
    if (BaseReelRules.CountMapSymbols(stop, maps) === 0) return;
    // save replace distribution index for next phases
    spinPhase.replaceDistributionIndex = SelectRandomIndex(maps, context.mathRng);
    const distribution = SelectValueFromIndex(maps, spinPhase.replaceDistributionIndex);
    BaseReelRules.ReplaceSymbols(stop, [], distribution, context.mathRng);
  }

  IncludeRowsAroundStop(_context: Context, spinPhase: SpinReelsPhase) {
    const rowsCount = this.GetRoundRules().GetRowsCount();
    const additionalRows = this.m_config.additionalRowsToInclude;
    const getRows = (offset: number): SymbolGrid => spinPhase.reels.map((reel, reelIdx) => {
      const reelOffset = spinPhase.reelsOffset[reelIdx] - Math.trunc(rowsCount / 2);
      return Array.from({ length: additionalRows }, (_, i) => reel[(((reelOffset + offset + i) % reel.length) + reel.length) % reel.length]);
    });
    spinPhase.beforeStop = getRows(-additionalRows);
    spinPhase.afterStop = getRows(rowsCount);
  }
}
