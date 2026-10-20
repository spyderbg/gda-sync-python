// Egt::Game::AlphaFamily::TetraSpinRules (AlphaFamily/Math/Reel/Rules/TetraSpinRules.h/.cpp): the tetra round's sub
// screens, each with the reel round rules of its own config.

import { ECollectorType } from '../../Common/Common.data';
import type { ReelRoundRules } from '../ReelRoundRules';
import { TetraSpinPhase } from '../ReelRoundPhase.data';
import { BaseReelRules, Context } from './BaseReelRules';
import { TetraSpinRulesConfig } from './TetraSpinRules.data';

export class TetraSpinRules extends BaseReelRules {
  readonly m_subScreenRules: ReelRoundRules[] = [];

  constructor(roundRules: ReelRoundRules, readonly m_config: TetraSpinRulesConfig) {
    super(roundRules);
    // Each sub screen is a reel round of its own: a copy of the tetra round's config with the sub screen's rules.
    const RulesClass = roundRules.constructor as new (...args: ConstructorParameters<typeof ReelRoundRules>) => ReelRoundRules;
    for (const subScreenConfig of m_config.subScreens) {
      const config = {
        ...roundRules.GetConfig(),
        expandConfig: subScreenConfig.expandConfig,
        lineConfig: subScreenConfig.lineConfig,
        scatterConfig: subScreenConfig.scatterConfig,
        spinConfig: subScreenConfig.spinConfig,
        copySymbolsConfig: subScreenConfig.copySymbolsConfig,
        stickSymbolsConfig: subScreenConfig.stickSymbolsConfig,
        collectorConfig: subScreenConfig.collectorConfig,
        tetraSpinConfig: TetraSpinRulesConfig(), // subscreens don't have tetra
      };
      this.m_subScreenRules.push(new RulesClass(config, roundRules.GetVisualAnalyze().GetConfig()));
    }
  }

  GetConfig() {
    return this.m_config;
  }

  GetSubScreenCount() {
    return Math.max(this.m_subScreenRules.length, 1);
  }

  GetTetraTriggerTimesBet() {
    return this.m_config.tetraTriggerTimesBet;
  }

  GetTetraMaxRounds() {
    return this.m_config.tetraMaxRounds;
  }

  GetSubScreenRules(index: number): ReelRoundRules {
    const rules = this.m_subScreenRules[index];
    if (!rules) throw new Error(`Tetra sub screen ${index} does not exist`);
    return rules;
  }

  Update(context: Context, tetraPhase: TetraSpinPhase) {
    // post features
    this.UpdateCollectAll(context, tetraPhase);
  }

  private UpdateCollectAll(context: Context, tetraPhase: TetraSpinPhase) {
    const hasCollectAll = tetraPhase.subScreens.some(s => s.phases.some(p => p.collector.type === ECollectorType.CollectAll));
    if (!hasCollectAll) return;
    tetraPhase.subScreens.forEach((subScreen, i) => {
      const collectorRules = this.GetSubScreenRules(i).GetCollectorRules();
      for (const phase of subScreen.phases) tetraPhase.summary.rewards.AddAll(collectorRules.CollectFrom(context, phase));
    });
  }
}
