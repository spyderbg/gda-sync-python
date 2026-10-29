// Egt::Simulators::MathData::BasicHot (JokerReelsCoins10Math/SimulatorConfig/BasicHot.data.h): the math file
// (math/var_<rtp>.json) as the simulators write it: Game for a game of the main round only, GameCoins with the coins
// round and the coins wheel.

import type { Lines, Paytable, ReelsDistribution, SymbolsData } from './MathDefs.data';

export interface Round {
  baseBet: number;
  allowedBets: number[];

  isExpandingWild: boolean;
  lines: Lines;
  linePaytable: Paytable;
  scatterPaytable: Paytable;
  reelsDistribution: ReelsDistribution;
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

  cappingCredits: number; // fixed capping
  cappingXBet: number; // dynamic capping
}

export interface GameCoins {
  rowsCount: number; // 3
  reelsCount: number; // 5
  symbolsData: SymbolsData;
  roundMain: Round;
  roundCoins: Round;
  roundWheel: RoundWheel;

  cappingCredits: number; // fixed capping
  cappingXBet: number; // dynamic capping

  maxBetMultiplier?: number | null; // Optional<int>
}
