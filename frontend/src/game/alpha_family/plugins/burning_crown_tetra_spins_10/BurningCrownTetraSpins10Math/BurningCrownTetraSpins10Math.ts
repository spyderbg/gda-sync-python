// Egt::Game::AlphaFamily::BurningCrownTetraSpins10Math (BurningCrownTetraSpins10Math.h/.cpp): the math module, which
// provides IMathTypes and IMathRules from the setup of its config (BurningCrownTetraSpins10Modules.json).

import { IResources } from '../../../../engine/Game/RuntimeExport/IResources';
import type { Runtime } from '../../../../engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '../../../../engine/ModuleManager/BaseModule';
import type { MathRulesInitConfig } from './MathRules.data';
import { MathRules } from './MathRules';
import { MATH_RULES } from './MathRules.description';
import { MathTypes } from './MathTypes';

export class BurningCrownTetraSpins10Math extends BaseModule {
  private m_mathTypes: MathTypes | null = null;
  private m_mathRules: MathRules | null = null;
  private m_rulesConfig: MathRulesInitConfig | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.m_mathTypes = new MathTypes(this);
    this.m_mathTypes.Init();
    this.m_mathRules = new MathRules(this);
    this.m_rulesConfig = BurningCrownTetraSpins10Math.ChooseMathFile(config);
    this.m_mathRules.Init(this.m_rulesConfig);
    return true;
  }

  Deinit() {
    this.m_mathRules?.Deinit();
    this.m_mathRules = null;
    this.m_mathTypes?.Deinit();
    this.m_mathTypes = null;
    super.Deinit();
  }

  /** For the C++ export (not in C++): how the rules are made, and the math file of the setup that plays. */
  GetMathExport() {
    if (!this.m_rulesConfig) throw new Error('BurningCrownTetraSpins10Math is not initialized');
    return { description: MATH_RULES, mathFile: this.RuntimeGet(IResources).GetIData<Record<string, unknown>>(this.m_rulesConfig.mathFileId) };
  }

  static ChooseMathFile(config: ModuleConfig): MathRulesInitConfig {
    const setups = config.setups as Partial<MathRulesInitConfig>[] | undefined;
    if (!Array.isArray(setups) || !setups.length) throw new Error('BurningCrownTetraSpins10Math: the config has no setups');
    // TODO: how to choose suitable setup if multiple are present
    const s = setups[0];
    return { id: String(s.id), simRtp: Number(s.simRtp), minCap: s.minCap ?? null, maxCap: s.maxCap ?? null, mathFileId: String(s.mathFileId) };
  }
}
