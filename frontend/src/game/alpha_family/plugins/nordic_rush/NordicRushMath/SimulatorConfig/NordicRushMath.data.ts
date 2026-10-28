// Egt::Simulators::MathData and Egt::Simulators::MathData::NordicRush (NordicRushMath/SimulatorConfig/NordicRushMath.data.h):
// the math file (math/var_<name>.json) as the simulators write it.

export interface SymbolsData {
  symbolNames: string[];
  wildId: number;
  scatterIds: number[];
}

/** ReelsDistribution entry */
export interface ReelsData {
  probability: number;
  intReels: number[][];
}

/** Probabilities for zero round */
export interface RtpReducer {
  zeroRounds: number[]; // for each bet
  perRounds: number; // zeroRounds/perRounds
}

/** lines and scatter paytables */
export type Paytable = number[][];
/** offsets */
export type Lines = number[][];
export type ReelsDistribution = ReelsData[];

export declare namespace NordicRush {
  interface SymbolsData {
    symbolNames: string[];
    wildId: number;
    coinId: number;
  }

  interface CashHeat {
    triggerCoins: number;
    initialSpins: number;

    dropCoinYesNo: number[]; // chance to drop new coin in CashHeat

    coinFsLowProbaPool: number[]; // pool -> [coinFsValues[0:3]]
    coinJpLowProbaPool: number[]; // pool -> [coinJpValues[0:3]]
    coinFsMidProbaPool: number[]; // pool -> [coinFsValues[0:3]]
    coinJpMidProbaPool: number[]; // pool -> [coinJpValues[0:3]]
    coinFsHighProbaPool: number[]; // pool -> [coinFsValues[0:3]]
    coinJpHighProbaPool: number[]; // pool -> [coinJpValues[0:3]]
  }

  interface RoundMain {
    allowedBets: number[];
    symbolsData: SymbolsData;
    reelsDistribution: ReelsDistribution;
    lines: Lines;
    linePaytable: Paytable;
    cashHeat: CashHeat;

    probaLMH: number[];
    coinFsLowProbaPool: number[];
    coinFsMidProbaPool: number[];
    coinFsHighProbaPool: number[];
  }

  interface RoundFree {
    symbolsData: SymbolsData;
    reelsDistribution: ReelsDistribution;
    lines: Lines;
    linePaytable: Paytable;
    cashHeat: CashHeat;

    probaLMH: number[];
    coinFsLowProbaPool: number[]; // coinFsValues[0:3]
    coinFsMidProbaPool: number[]; // coinFsValues[0:3]
    coinFsHighProbaPool: number[]; // coinFsValues[0:3]
  }

  interface RoundWheel {
    percentageValues: number[]; // [90, 92, 98, 101]
    weights: number[]; // [750, 430, 150, 40]
  }

  interface Game {
    rowsCount: number; // 3
    reelsCount: number; // 5

    coinFsValues: number[]; // like [1, 2, 3, 4]
    coinJpValues: number[]; // like [5, 20, 200, 1000]
    grandX3Value: number; // 3xGrand coins -> Grand Jackpot
    majorX2Value: number; // 2xMajor coins -> Major Jackpot

    roundMain: RoundMain;
    roundFree: RoundFree;
    roundPuntiMain: RoundMain;
    roundPuntiFree: RoundFree;
    roundWheel: RoundWheel;

    cappingCredits: number; // 10000eu
    maxBetMultiplier?: number | null; // Optional<int>
  }
}
