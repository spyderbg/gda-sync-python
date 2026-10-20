// Egt::Simulators::MathData::BurningCrown (BurningCrownTetraSpins10Math/SimulatorConfig/BurningCrown.data.h): the math
// file (math/var_10BCTS_<rtp>.json) as the simulators write it.

import type { Lines, Paytable, ReelsDistribution, RtpReducer, SymbolsData } from './MathDefs.data';

export interface MainRound {
  baseBet: number;
  allowedBets: number[];
  rtpReducer: RtpReducer;
  lines: Lines;
  linePaytable: Paytable;
  reels: ReelsDistribution;
}

export interface TetraRound {
  allowedBets: number[];
  rtpReducer: RtpReducer;
  lines: Lines;
  /** lineMoneyPaytabe[symbolId][symbolCount] */
  linePaytable: Paytable;
  reelsScreen0: ReelsDistribution;
  reelsScreen1: ReelsDistribution;
  reelsScreen2: ReelsDistribution;
  reelsScreen3: ReelsDistribution;
  wildsScreen0: number[][];
  wildsScreen1: number[][];
  wildsScreen2: number[][];
  wildsScreen3: number[][];
}

export interface Game {
  rowsCount: number; // 3
  reelsCount: number; // 5
  symbolsData: SymbolsData;
  mainRound: MainRound;
  tetraRound: TetraRound;
  tetraTrigger: number; // 4
  tetraMaxRounds: number; // 100
  maxBetTetraMultiplier: number;
  cappingCredits: number; // fixed capping
  cappingXBet: number; // dynamic capping
}
