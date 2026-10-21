// Egt::Game::AlphaFamily::MathTypes (BurningCrownTetraSpins10Math/MathTypes.h/.cpp): the game's round types and
// currencies by name.

import type { CurrencyType, GameRoundType } from '@game/engine/Game/Math/Common.data';
import { IMathTypes } from '@game/engine/Game/RuntimeExport/IMathTypes';
import { Currency, RoundType, format_as } from '@game/alpha_family/libs/AlphaFamily/Math/Common/Common.data';
import { IMathRules } from '@game/alpha_family/libs/AlphaFamily/RuntimeExport/IMathRules';
import type { BurningCrownTetraSpins10Math } from './BurningCrownTetraSpins10Math';

export class MathTypes implements IMathTypes {
  constructor(private readonly m_math: BurningCrownTetraSpins10Math) {}

  Init() {
    this.m_math.RuntimeAdd(IMathTypes, this);
  }

  Deinit() {
    this.m_math.RuntimeRemove(IMathTypes);
  }

  GetAvailableRoundTypes(): GameRoundType[] {
    return [...this.m_math.RuntimeGet(IMathRules).GetAvailableRoundTypes()];
  }

  GetMainRoundType(): GameRoundType {
    return RoundType.Main;
  }

  GetRoundTypeName(roundType: GameRoundType) {
    return format_as(roundType as RoundType);
  }

  GetCreditsCurrencyType(): CurrencyType {
    return Currency.Credits;
  }

  GetCurrencyName(currencyType: CurrencyType) {
    return Currency.ToString(currencyType);
  }
}
