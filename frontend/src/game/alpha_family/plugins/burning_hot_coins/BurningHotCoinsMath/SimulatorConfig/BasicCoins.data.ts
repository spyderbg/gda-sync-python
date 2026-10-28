// Egt::Simulators::MathData::BasicCoins (BurningHotCoinsMath/SimulatorConfig/BasicCoins.data.h): the math file
// (math/var_<rtp>.json) as the simulators write it.

import type { Lines, Paytable, ReelsDistribution, SymbolsData } from './MathDefs.data';

export interface Round {
  isExpandingWild: boolean;
  allowedBets: number[];

  reelsDistribution: ReelsDistribution;
  lines: Lines;

  linePaytable: Paytable;
  scatterPaytable: Paytable;
}

export interface RoundWheel {
  percentageValues: number[]; // [90, 92, 98, 101]
  weights: number[]; // [750, 430, 150, 40]
}

export interface Game {
  rowsCount: number; // 3
  reelsCount: number; // 5
  symbolsData: SymbolsData;
  roundMain: Round;
  roundCoins: Round;
  roundWheel: RoundWheel;
  cappingCredits: number; // 10000eu
  maxBetMultiplier?: number | null; // Optional<int>
}
