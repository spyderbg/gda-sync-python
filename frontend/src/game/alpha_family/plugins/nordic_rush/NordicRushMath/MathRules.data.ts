// Egt::Game::AlphaFamily::MathRulesInitConfig and FakeReelsConfig (NordicRushMath/MathRules.data.h).

export interface MathRulesInitConfig {
  id: string;
  simRtp: number;
  minCap: number | null;
  maxCap: number | null;
  mathFileId: string;
}

export interface FakeReelsConfig {
  fakeReels: number[][];
  fakeReelsFree: number[][];
  fakeReelsFlash: number[][];
  animationCoinThreshold: number;
}
