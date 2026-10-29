// Egt::Game::AlphaFamily::JokerReelsCoins10Math (JokerReelsCoins10Math.h/.cpp): the math module, which provides
// IMathTypes and IMathRules from the setup of its config (JokerReelsCoins10Modules.json).

import type { Runtime } from '@game/engine/GameCore/RuntimeAccess';
import { BaseModule, type ModuleConfig } from '@game/engine/ModuleManager/BaseModule';
import type { MathRulesInitConfig } from './MathRules.data';
import { MathRules } from './MathRules';
import { MathTypes } from './MathTypes';

export class JokerReelsCoins10Math extends BaseModule {
  private m_mathTypes: MathTypes | null = null;
  private m_mathRules: MathRules | null = null;

  Init(runtime: Runtime, config: ModuleConfig) {
    super.Init(runtime, config);
    this.m_mathTypes = new MathTypes(this);
    this.m_mathTypes.Init();
    this.m_mathRules = new MathRules(this);
    this.m_mathRules.Init(JokerReelsCoins10Math.ChooseMathFile(config));
    return true;
  }

  Deinit() {
    this.m_mathRules?.Deinit();
    this.m_mathRules = null;
    this.m_mathTypes?.Deinit();
    this.m_mathTypes = null;
    super.Deinit();
  }

  static ChooseMathFile(config: ModuleConfig): MathRulesInitConfig {
    const setups = config.setups as Partial<MathRulesInitConfig>[] | undefined;
    if (!Array.isArray(setups) || !setups.length) throw new Error('JokerReelsCoins10Math: the config has no setups');
    // TODO: how to choose suitable setup if multiple are present
    const s = setups[0];
    return { id: String(s.id), simRtp: Number(s.simRtp), minCap: s.minCap ?? null, maxCap: s.maxCap ?? null, mathFileId: String(s.mathFileId) };
  }
}
