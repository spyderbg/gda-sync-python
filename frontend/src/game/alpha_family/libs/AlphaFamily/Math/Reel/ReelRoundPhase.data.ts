// Egt::Game::AlphaFamily reel round phases (AlphaFamily/Math/Reel/ReelRoundPhase.data.h/.cpp).
//
// The C++ std::variant<SpinReelsPhase, TetraSpinPhase> is a union of classes here: std::get_if<SpinReelsPhase>(&phase)
// is `phase instanceof SpinReelsPhase`.

import { Currencies } from '../../../../../engine/Game/Math/Common.data';
import { type CollectorInfo, CombinationType, ECollectorType, Multipliers, PayoutSummary, PayTable, PayTableV2, type Reels, type ReelsOffset, type SymbolGrid, type SymbolId, type SymbolViewInfos } from '../Common/Common.data';

export class ReelCombination {
  type = CombinationType.Undefined;
  id = -1;
  bet = 0;
  symbolId: SymbolId = -1;
  symbolCount = 0;
  symbolViewInfos: SymbolViewInfos = [];
  wildIds = new Set<SymbolId>();
  wildCount = 0;
  multipliers = new Multipliers();
  rewards = new Currencies();

  Clone() {
    const result = Object.assign(new ReelCombination(), this);
    result.symbolViewInfos = [...this.symbolViewInfos];
    result.wildIds = new Set(this.wildIds);
    result.multipliers = this.multipliers.Clone();
    result.rewards = this.rewards.Clone();
    return result;
  }

  HasPayout(payTables: (PayTable | PayTableV2)[]) {
    return payTables.some(payTable => payTable.HasPayout(this.symbolId, this.symbolCount));
  }

  AddRewardsFrom(payTables: (PayTable | PayTableV2)[]) {
    for (const payTable of payTables) payTable.Payout(this.bet, this.symbolId, this.symbolCount, this.multipliers, this.rewards);
  }

  equals(rhs: ReelCombination) {
    return this.type === rhs.type && this.id === rhs.id && this.bet === rhs.bet && this.symbolId === rhs.symbolId &&
      this.symbolCount === rhs.symbolCount && this.symbolViewInfos.length === rhs.symbolViewInfos.length &&
      this.symbolViewInfos.every((info, index) => info.key() === rhs.symbolViewInfos[index].key());
  }
}

export type ReelCombinations = ReelCombination[];

export function CombinationsEqual(a: ReelCombinations, b: ReelCombinations) {
  return a.length === b.length && a.every((combination, index) => combination.equals(b[index]));
}

/** PayoutSummary += ReelCombination */
export function AddCombination(summary: PayoutSummary, combination: ReelCombination) {
  summary.rewards.AddAll(combination.rewards);
  summary.combinations++;
  return summary;
}

export class SpinReelsPhase {
  animation = 0;
  initialStop: SymbolGrid = [];
  reels: Reels = [];
  reelsOffset: ReelsOffset = [];
  replaceDistributionIndex = 0;
  collector: CollectorInfo = { type: ECollectorType.None, bonusValue: 0 };
  beforeStop: SymbolGrid = [];
  afterStop: SymbolGrid = [];
  stop: SymbolGrid = [];
  combinations: ReelCombinations = [];
  summary = new PayoutSummary();
}

export type ReelRoundNoTetraPhase = SpinReelsPhase;

export class TetraSubScreen {
  phases: ReelRoundNoTetraPhase[] = [];
  summary = new PayoutSummary();
}

export class TetraSpinPhase {
  animation = 0;
  replaceDistributionIndex = 0;
  subScreens: TetraSubScreen[] = [];
  summary = new PayoutSummary();
}

export type ReelRoundPhase = SpinReelsPhase | TetraSpinPhase;
export type ReelRoundPhases = ReelRoundPhase[];

/** PayoutSummary += ReelRoundPhase */
export function AddPhase(summary: PayoutSummary, phase: ReelRoundPhase) {
  return summary.AddSummary(phase.summary);
}
