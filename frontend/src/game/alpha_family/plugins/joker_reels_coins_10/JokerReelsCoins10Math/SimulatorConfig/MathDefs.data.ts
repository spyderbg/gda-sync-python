// Egt::Simulators::MathData (JokerReelsCoins10Math/SimulatorConfig/MathDefs.data.h): the math file's types, shared with
// the math simulators. "You can 'add', but NOT delete or rename."

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
