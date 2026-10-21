// Egt::Game::AlphaFamily::BaseReelRules (AlphaFamily/Math/Reel/Rules/BaseReelRules.h/.cpp).

import type { IRng } from '@game/engine/GameCore/Random/IRng';
import { RoundConfigError } from '../../Common/Exceptions';
import { type Line, type Reels, type ReelsOffset, type SymbolGrid, SymbolGridCoordinates, type SymbolId, type SymbolIds, SymbolViewInfo, type SymbolViewInfos } from '../../Common/Common.data';
import { SelectRandomValue, type Weighted, type WeightedOffset } from '../../Common/Weighted';
import { AddCombination, type ReelRoundPhase, type ReelRoundPhases, SpinReelsPhase } from '../ReelRoundPhase.data';
import type { ReelRoundInput } from '../ReelRoundInput.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import type { ReplaceSymbolsMap } from './SpinRules.data';

export class Context {
  phases: ReelRoundPhases = [];
  gridTocopyFrom: SymbolGrid | null = null;

  constructor(readonly input: ReelRoundInput, readonly mathRng: IRng, readonly visualRng: IRng) {}
}

export class BaseReelRules {
  constructor(protected readonly m_roundRules: ReelRoundRules) {}

  GetRoundRules(): ReelRoundRules {
    return this.m_roundRules;
  }

  static HasSymbol(stop: SymbolGrid, symbol: SymbolId) {
    return stop.some(column => column.includes(symbol));
  }

  static CountSymbols(stop: SymbolGrid, symbols: SymbolId | SymbolIds) {
    const list = Array.isArray(symbols) ? symbols : [symbols];
    let count = 0;
    for (const column of stop) for (const symbol of column) if (list.includes(symbol)) count++;
    return count;
  }

  static GetAllCoordinates(stop: SymbolGrid, symbols: SymbolId | SymbolIds): SymbolViewInfos {
    const list = Array.isArray(symbols) ? symbols : [symbols];
    const infos: SymbolViewInfos = [];
    stop.forEach((reel, reelId) => reel.forEach((symbol, rowId) => {
      if (list.includes(symbol)) infos.push(new SymbolViewInfo(symbol, new SymbolGridCoordinates(reelId, rowId)));
    }));
    return infos;
  }

  static GetLineSymbols(stop: SymbolGrid, line: Line): SymbolIds {
    return line.slice(0, stop.length).map((row, reel) => stop[reel][row]);
  }

  static GetLineSymbol(stop: SymbolGrid, line: Line, reel: number): SymbolId {
    return stop[reel][line[reel]];
  }

  static CopyFromReelsToGrid(reels: Reels, offsets: ReelsOffset, rows: number): SymbolGrid {
    return reels.map((reel, c) => {
      const offset = reel.length + offsets[c] - Math.trunc(rows / 2);
      return Array.from({ length: rows }, (_, r) => reel[(offset + r) % reel.length]);
    });
  }

  static ReplaceSymbols(stop: SymbolGrid, refStop: SymbolGrid, map: ReplaceSymbolsMap, rng: IRng) {
    for (const reel of stop) {
      for (let row = 0; row < reel.length; row++) {
        const replacedIds = new Set<SymbolId>();
        // recursively replace symbol until it's not in the distribution map
        while (map.has(reel[row])) {
          if (replacedIds.has(reel[row])) throw new RoundConfigError('BaseReelRules::ReplaceSymbols loop detected!', { symbolId: reel[row] });
          replacedIds.add(reel[row]);
          const distribution = map.get(reel[row])!;
          reel[row] = distribution.repetition
            ? SelectRandomValue(distribution, rng)
            : SelectRandomValue(distribution, rng, BaseReelRules.GetWeightOffsets(stop, refStop, distribution));
        }
      }
    }
  }

  static GetWeightOffsets(stop: SymbolGrid, refStop: SymbolGrid, distribution: Weighted<SymbolId>): WeightedOffset<SymbolId> {
    const offsets: WeightedOffset<SymbolId> = new Map();
    // count only the replaced symbols for this distribution and substract them
    for (const { value: symbolId } of distribution.range) {
      const count = BaseReelRules.CountSymbols(stop, symbolId);
      if (count === 0) continue;
      const prevCount = BaseReelRules.CountSymbols(refStop, symbolId);
      offsets.set(symbolId, (offsets.get(symbolId) ?? 0) - (count - prevCount));
    }
    return offsets;
  }

  static CountMapSymbols(stop: SymbolGrid, maps: Weighted<ReplaceSymbolsMap>) {
    const symbolIds = new Set<SymbolId>();
    for (const item of maps.range) for (const symbolId of item.value.keys()) symbolIds.add(symbolId);
    return BaseReelRules.CountSymbols(stop, [...symbolIds]);
  }

  static UpdatePhaseSummary(phase: ReelRoundPhase) {
    if (phase instanceof SpinReelsPhase) {
      for (const combination of phase.combinations) AddCombination(phase.summary, combination);
      return;
    }
    for (const subscreen of phase.subScreens) {
      for (const spinPhase of subscreen.phases) {
        for (const combination of spinPhase.combinations) AddCombination(spinPhase.summary, combination);
        subscreen.summary.AddSummary(spinPhase.summary);
      }
      phase.summary.AddSummary(subscreen.summary);
    }
  }
}
