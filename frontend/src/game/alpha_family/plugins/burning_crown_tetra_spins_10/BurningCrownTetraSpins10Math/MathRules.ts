// Egt::Game::AlphaFamily::MathRules (BurningCrownTetraSpins10Math/MathRules.h/.cpp): the rules of the main and tetra
// rounds, made from the math file the setup names (an IData of math/RssIData.json) and the fake reels, as
// MathRules.description.ts describes them.

import type { WheelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Wheel/WheelRoundRules';
import { IResources } from '@game/engine/Game/RuntimeExport/IResources';
import { BuildReelRoundRules } from '@game/authoring/MathRulesDescription';
import { RoundType } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import type { ReelRoundRules } from '@game/alpha_family/libs/AlphaFamily/Math/Reel/ReelRoundRules';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import type { BurningCrownTetraSpins10Math } from './BurningCrownTetraSpins10Math';
import type { FakeReelsConfig, MathRulesInitConfig } from './MathRules.data';
import { MATH_RULES } from './MathRules.description';
import type { Game } from './SimulatorConfig/BurningCrown.data';

export class MathRules implements IMathRules {
  private m_reelRoundRules = new Map<RoundType, ReelRoundRules>();
  private m_availableRoundTypes: RoundType[] = [];
  private m_consecutiveRoundTypePriorities = new Map<RoundType, number>();

  constructor(private readonly m_math: BurningCrownTetraSpins10Math) {}

  Init(rulesConfig: MathRulesInitConfig) {
    this.m_math.RuntimeAdd(IMathRules, this);
    this.CreateRules(rulesConfig);
    this.CollectAvailableRoundTypes();
    this.CollectConsecutiveRoundTypePriorities();
  }

  Deinit() {
    this.m_math.RuntimeRemove(IMathRules);
  }

  GetAvailableRoundTypes() {
    return this.m_availableRoundTypes;
  }

  GetConsecutiveRoundTypePriorities() {
    return this.m_consecutiveRoundTypePriorities;
  }

  HasReelRoundRules(roundType: RoundType) {
    return this.m_reelRoundRules.has(roundType);
  }

  GetReelRoundRules(roundType: RoundType) {
    const rules = this.m_reelRoundRules.get(roundType);
    if (!rules) throw new Error(`ReelRoundRules not found for roundType=${RoundType[roundType]}`);
    return rules;
  }

  HasHoldAndSpinRules(_roundType: RoundType) {
    return false;
  }

  HasWheelRoundRules(_roundType: RoundType) {
    return false;
  }

  GetWheelRoundRules(roundType: RoundType): WheelRoundRules {
    throw new Error(`BurningCrownTetraSpins10 has no wheel round rules (${roundType})`);
  }

  /** The rules of the math file's game, without the runtime: what the simulator and the tests use. */
  static CreateReelRoundRules(gameConfig: Game, fakeReelsConfig: FakeReelsConfig, rulesConfig: MathRulesInitConfig) {
    // MathRules.cpp fills each ReelRoundRulesConfig by hand; here MATH_RULES describes them, and the C++ export writes
    // MathRules.cpp from it.
    return BuildReelRoundRules(MATH_RULES, gameConfig, fakeReelsConfig.fakeReels, { simRtp: rulesConfig.simRtp });
  }

  private CreateRules(rulesConfig: MathRulesInitConfig) {
    // read from simulator's json config
    const resources = this.m_math.RuntimeGet(IResources);
    const gameConfig = resources.GetIData<Game>(rulesConfig.mathFileId);
    const fakeReelsConfig = resources.GetIData<FakeReelsConfig>('FakeReelsConfig');
    this.m_reelRoundRules = MathRules.CreateReelRoundRules(gameConfig, fakeReelsConfig, rulesConfig);
  }

  private CollectConsecutiveRoundTypePriorities() {
    this.m_consecutiveRoundTypePriorities = new Map(MATH_RULES.consecutiveRoundTypePriorities.map(([name, priority]) => [RoundType[name], priority]));
  }

  private CollectAvailableRoundTypes() {
    this.m_availableRoundTypes = [...this.m_reelRoundRules.keys()];
  }
}
