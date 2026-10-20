// Egt::Simulators::MathData (BurningCrownTetraSpins10Math/SimulatorConfig/MathDefs.data.h): the math file's types,
// shared with the math simulators. "You can 'add', but NOT delete or rename."

export interface SymbolsData {
  symbolNames: string[];
  wildId: number;
  scatterIds: number[];
}

/** Probabilities for zero round: zeroRounds[bet index] / perRounds. */
export interface RtpReducer {
  zeroRounds: number[];
  perRounds: number;
}

/** lines and scatter paytables */
export type Paytable = number[][];
/** offsets */
export type Lines = number[][];

/** Classic reels distribution: a reel set and its weight. */
export interface ReelsData {
  probability: number;
  intReels: number[][];
}

export type ReelsDistribution = ReelsData[];
