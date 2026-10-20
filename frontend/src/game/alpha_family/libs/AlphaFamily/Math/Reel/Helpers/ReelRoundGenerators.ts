// Egt::Game::AlphaFamily reel round generators (AlphaFamily/Math/Reel/Helpers/ReelRoundGenerators.h/.cpp): search
// random rounds for one that meets a condition, such as the zero win round the game shows before its first match.

import { HistoryEngine, MonteCarloEngineHat, type RngNumbers } from '../../../../../../engine/GameCore/Random/IRng';
import { RoundResult } from '../../RoundResult.data';
import { ReelRoundInput } from '../ReelRoundInput.data';
import type { ReelRoundRules } from '../ReelRoundRules';

export type ReelRoundCondition = (result: RoundResult) => boolean;

export function GenerateRandomRound(rules: ReelRoundRules, input: ReelRoundInput, seed: RngNumbers, attempts: number,
  condition: ReelRoundCondition): RoundResult | null {
  const rng = new HistoryEngine(new MonteCarloEngineHat(seed));
  for (let i = 0; i < attempts; ++i) {
    rng.ClearHistory();
    const round = rules.CalculateRound(input, rng);
    if (round instanceof RoundResult && condition(round)) return round;
  }
  return null;
}

export function GenerateRandomZeroRewardRound(rules: ReelRoundRules, input: ReelRoundInput, seed: RngNumbers): RoundResult | null {
  // Note: zero win rounds should be common and impossible to miss after so many attempts
  return GenerateRandomRound(rules, input, seed, 1_000_000, result => result.ForceGetSummaryWithoutRecovery().rewards.empty());
}
